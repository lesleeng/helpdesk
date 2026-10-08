"""Webhooks (signed, retried, SSRF-guarded) and Slack notifications."""
import hashlib
import hmac
import json

import httpx
import pytest

from app.config import settings
from app.models.webhook import Webhook, WebhookDelivery
from app.services import slack_service, webhook_service

BASE = "/api/helpdesk"
PUBLIC_IP = "93.184.216.34"


@pytest.fixture(autouse=True)
def fast_and_public(monkeypatch):
    """No sleeping between retries and no real DNS: every host resolves to a public address."""
    monkeypatch.setattr(webhook_service, "RETRY_DELAYS", (0, 0, 0))
    monkeypatch.setattr(webhook_service, "resolve_host", lambda host: [PUBLIC_IP])


@pytest.fixture
def sent(monkeypatch):
    """Capture outbound webhook calls; set `sent.code` to change the receiver's answer."""
    calls = []

    class Recorder(list):
        code = 200

    rec = Recorder()

    def fake_post(url, body, headers):
        rec.append({"url": url, "body": body, "headers": headers})
        return rec.code

    monkeypatch.setattr(webhook_service, "http_post", fake_post)
    return rec


def make_hook(client, headers, **kw):
    payload = {"name": "CI", "url": "https://example.com/hook", "events": ["*"]}
    payload.update(kw)
    return client.post(f"{BASE}/webhooks", json=payload, headers=headers)


def make_ticket(client, headers, category_id, **kw):
    payload = {"title": "Printer jammed", "description": "Floor 2", "category_id": category_id}
    payload.update(kw)
    r = client.post(f"{BASE}/tickets", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ---------- registration ----------


def test_admin_only(client, auth_headers, tech_headers):
    for headers in (auth_headers, tech_headers):
        assert make_hook(client, headers).status_code == 403
        assert client.get(f"{BASE}/webhooks", headers=headers).status_code == 403
        assert client.get(f"{BASE}/integrations", headers=headers).status_code == 403


def test_secret_is_shown_once(client, admin_auth_headers):
    created = make_hook(client, admin_auth_headers).json()
    assert len(created["secret"]) >= 32
    listed = client.get(f"{BASE}/webhooks", headers=admin_auth_headers).json()
    assert "secret" not in listed[0] and listed[0]["id"] == created["id"]
    rotated = client.post(
        f"{BASE}/webhooks/{created['id']}/rotate-secret", headers=admin_auth_headers
    ).json()
    assert rotated["secret"] != created["secret"]


def test_validation(client, admin_auth_headers, monkeypatch):
    assert make_hook(client, admin_auth_headers, events=["nope"]).status_code == 422
    assert make_hook(client, admin_auth_headers, url="ftp://example.com/x").status_code == 422
    assert (
        make_hook(client, admin_auth_headers, url="https://user:pw@example.com/x").status_code
        == 422
    )
    assert make_hook(client, admin_auth_headers, name="").status_code == 422
    monkeypatch.setattr(webhook_service, "resolve_host", lambda host: [])
    r = make_hook(client, admin_auth_headers)
    assert r.status_code == 422 and "resolved" in r.json()["detail"]


@pytest.mark.parametrize(
    "address",
    ["127.0.0.1", "10.0.0.5", "192.168.1.10", "169.254.169.254", "172.16.0.1", "::1", "0.0.0.0"],
)
def test_private_addresses_are_refused(client, admin_auth_headers, monkeypatch, address):
    monkeypatch.setattr(webhook_service, "resolve_host", lambda host: [address])
    r = make_hook(client, admin_auth_headers, url="https://internal.example/hook")
    assert r.status_code == 422 and "private or internal" in r.json()["detail"]


def test_private_addresses_allowed_when_configured(client, admin_auth_headers, monkeypatch):
    monkeypatch.setattr(webhook_service, "resolve_host", lambda host: ["127.0.0.1"])
    monkeypatch.setattr(settings, "WEBHOOKS_ALLOW_PRIVATE", True)
    assert (
        make_hook(client, admin_auth_headers, url="http://localhost:9000/hook").status_code == 201
    )


def test_update_toggle_and_delete(client, admin_auth_headers):
    hid = make_hook(client, admin_auth_headers).json()["id"]
    url = f"{BASE}/webhooks/{hid}"
    r = client.patch(
        url,
        json={"active": False, "name": "Renamed", "events": ["ticket.created"]},
        headers=admin_auth_headers,
    )
    assert (
        r.json()["active"] is False
        and r.json()["name"] == "Renamed"
        and r.json()["events"] == ["ticket.created"]
    )
    assert (
        client.patch(url, json={"events": ["bogus"]}, headers=admin_auth_headers).status_code == 422
    )
    assert client.delete(url, headers=admin_auth_headers).status_code == 204
    assert (
        client.get(f"{BASE}/webhooks/{hid}/deliveries", headers=admin_auth_headers).status_code
        == 404
    )


def test_integration_status(client, admin_auth_headers, monkeypatch):
    body = client.get(f"{BASE}/integrations", headers=admin_auth_headers).json()
    assert body["slack_enabled"] is False and "ticket.created" in body["webhook_events"]
    monkeypatch.setattr(settings, "ENABLE_SLACK_NOTIFICATIONS", True)
    monkeypatch.setattr(settings, "SLACK_WEBHOOK_URL", "https://hooks.slack.test/x")
    assert (
        client.get(f"{BASE}/integrations", headers=admin_auth_headers).json()["slack_enabled"]
        is True
    )


# ---------- delivery ----------


def test_event_is_delivered_signed(client, seeded, auth_headers, admin_auth_headers, sent):
    created = make_hook(client, admin_auth_headers, events=["ticket.created"]).json()
    tid = make_ticket(client, auth_headers, seeded.id)
    assert len(sent) == 1
    call = sent[0]
    body = json.loads(call["body"])
    assert body["event"] == "ticket.created" and body["ticket"]["id"] == tid
    assert body["ticket"]["requester_id"] == "user-1" and body["actor"]["id"] == "user-1"
    assert "description" not in body["ticket"]  # summaries only, never the free-text body
    expected = (
        "sha256="
        + hmac.new(created["secret"].encode(), call["body"].encode(), hashlib.sha256).hexdigest()
    )
    assert call["headers"]["X-Helpdesk-Signature"] == expected
    assert call["headers"]["X-Helpdesk-Event"] == "ticket.created"
    log = client.get(
        f"{BASE}/webhooks/{created['id']}/deliveries", headers=admin_auth_headers
    ).json()
    assert log[0]["status"] == "success" and log[0]["attempts"] == 1 and log[0]["ticket_id"] == tid
    listed = client.get(f"{BASE}/webhooks", headers=admin_auth_headers).json()
    assert listed[0]["last_status"] == "success"


def test_only_subscribed_active_hooks_receive(
    client, seeded, auth_headers, admin_auth_headers, sent
):
    make_hook(client, admin_auth_headers, name="created", events=["ticket.created"])
    make_hook(client, admin_auth_headers, name="status", events=["ticket.status_changed"])
    off = make_hook(client, admin_auth_headers, name="off", events=["*"]).json()
    client.patch(f"{BASE}/webhooks/{off['id']}", json={"active": False}, headers=admin_auth_headers)
    make_ticket(client, auth_headers, seeded.id)
    assert [json.loads(c["body"])["event"] for c in sent] == ["ticket.created"]


def test_retries_then_gives_up(client, seeded, auth_headers, admin_auth_headers, sent):
    sent.code = 500
    hid = make_hook(client, admin_auth_headers).json()["id"]
    make_ticket(client, auth_headers, seeded.id)
    assert len(sent) == 3
    log = client.get(f"{BASE}/webhooks/{hid}/deliveries", headers=admin_auth_headers).json()[0]
    assert (log["status"], log["attempts"], log["response_code"]) == ("failed", 3, 500)
    assert "HTTP 500" in log["error"]


def test_recovers_on_a_later_attempt(client, seeded, auth_headers, admin_auth_headers, monkeypatch):
    answers = iter([502, 200])
    monkeypatch.setattr(webhook_service, "http_post", lambda *a: next(answers))
    hid = make_hook(client, admin_auth_headers).json()["id"]
    make_ticket(client, auth_headers, seeded.id)
    log = client.get(f"{BASE}/webhooks/{hid}/deliveries", headers=admin_auth_headers).json()[0]
    assert (log["status"], log["attempts"]) == ("success", 2)


def test_network_errors_are_recorded(client, seeded, auth_headers, admin_auth_headers, monkeypatch):
    def boom(*a):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(webhook_service, "http_post", boom)
    hid = make_hook(client, admin_auth_headers).json()["id"]
    make_ticket(client, auth_headers, seeded.id)
    log = client.get(f"{BASE}/webhooks/{hid}/deliveries", headers=admin_auth_headers).json()[0]
    assert log["status"] == "failed" and "ConnectError" in log["error"]


def test_address_is_rechecked_at_delivery(
    client, seeded, auth_headers, admin_auth_headers, sent, monkeypatch
):
    hid = make_hook(client, admin_auth_headers).json()["id"]
    monkeypatch.setattr(webhook_service, "resolve_host", lambda host: ["10.0.0.1"])  # DNS changed
    make_ticket(client, auth_headers, seeded.id)
    assert sent == []  # nothing was sent to the internal address
    log = client.get(f"{BASE}/webhooks/{hid}/deliveries", headers=admin_auth_headers).json()[0]
    assert log["status"] == "failed" and "private or internal" in log["error"]


def test_test_button_sends_a_ping(client, admin_auth_headers, sent):
    hid = make_hook(client, admin_auth_headers, events=["ticket.created"]).json()["id"]
    r = client.post(f"{BASE}/webhooks/{hid}/test", headers=admin_auth_headers)
    assert r.status_code == 200 and r.json()["event"] == "ping"
    assert json.loads(sent[0]["body"])["event"] == "ping"
    log = client.get(f"{BASE}/webhooks/{hid}/deliveries", headers=admin_auth_headers).json()[0]
    assert log["status"] == "success"


def test_lifecycle_events(
    client, db, seeded, auth_headers, admin_auth_headers, manager_headers, sent
):
    from app.models.category import TicketSubcategory

    make_hook(client, admin_auth_headers)
    sub = db.query(TicketSubcategory).filter_by(name="Access request").one()
    tid = make_ticket(client, auth_headers, sub.category_id, subcategory_id=sub.id)
    client.post(
        f"{BASE}/tickets/{tid}/approval", json={"decision": "approve"}, headers=manager_headers
    )
    client.put(
        f"{BASE}/tickets/{tid}/assignee", json={"assignee_id": "tech-1"}, headers=admin_auth_headers
    )
    client.patch(
        f"{BASE}/tickets/{tid}", json={"status": "in_progress"}, headers=admin_auth_headers
    )
    client.post(
        f"{BASE}/tickets/{tid}/comments",
        json={"content": "public hello"},
        headers=admin_auth_headers,
    )
    client.post(
        f"{BASE}/tickets/{tid}/comments",
        json={"content": "SECRET note", "is_internal": True},
        headers=admin_auth_headers,
    )
    client.patch(f"{BASE}/tickets/{tid}", json={"status": "resolved"}, headers=admin_auth_headers)
    client.post(
        f"{BASE}/tickets/{tid}/feedback",
        json={"rating": 5, "comment": "private text"},
        headers=auth_headers,
    )

    events = [json.loads(c["body"]) for c in sent]
    names = [e["event"] for e in events]
    assert names == [
        "ticket.created",
        "ticket.approval_requested",
        "ticket.approval_decided",
        "ticket.assigned",
        "ticket.status_changed",
        "ticket.commented",
        "ticket.status_changed",
        "ticket.feedback_submitted",
    ]
    assert events[2]["data"] == {"decision": "approve"}
    assert events[4]["data"] == {"from": "open"} and events[4]["ticket"]["status"] == "in_progress"
    assert events[5]["data"]["comment"]["content"] == "public hello"
    assert events[-1]["data"] == {"rating": 5}
    blob = " ".join(c["body"] for c in sent)
    assert "SECRET note" not in blob and "private text" not in blob


def test_bulk_and_reopen_events(client, seeded, auth_headers, admin_auth_headers, sent):
    a = make_ticket(client, auth_headers, seeded.id)
    b = make_ticket(client, auth_headers, seeded.id)
    make_hook(client, admin_auth_headers, events=["ticket.status_changed", "ticket.assigned"])
    client.post(
        f"{BASE}/tickets/bulk",
        json={"ticket_ids": [a, b], "status": "in_progress", "assignee_id": "tech-2"},
        headers=admin_auth_headers,
    )
    assert (
        sorted(json.loads(c["body"])["event"] for c in sent)
        == ["ticket.assigned"] * 2 + ["ticket.status_changed"] * 2
    )
    sent.clear()
    client.patch(f"{BASE}/tickets/{a}", json={"status": "resolved"}, headers=admin_auth_headers)
    sent.clear()
    client.post(f"{BASE}/tickets/{a}/reopen", headers=auth_headers)
    assert json.loads(sent[0]["body"])["data"] == {"from": "resolved"}


def test_bulk_only_reports_real_changes(client, seeded, auth_headers, admin_auth_headers, sent):
    a = make_ticket(client, auth_headers, seeded.id)
    client.put(
        f"{BASE}/tickets/{a}/assignee", json={"assignee_id": "tech-1"}, headers=admin_auth_headers
    )
    make_hook(client, admin_auth_headers)
    client.post(
        f"{BASE}/tickets/bulk",
        json={"ticket_ids": [a], "assignee_id": "tech-1"},
        headers=admin_auth_headers,
    )
    assert sent == []  # same assignee: no event


def test_deleting_a_hook_removes_its_log(
    client, db, seeded, auth_headers, admin_auth_headers, sent
):
    hid = make_hook(client, admin_auth_headers).json()["id"]
    make_ticket(client, auth_headers, seeded.id)
    assert db.query(WebhookDelivery).filter_by(webhook_id=hid).count() == 1
    client.delete(f"{BASE}/webhooks/{hid}", headers=admin_auth_headers)
    db.expire_all()
    assert db.query(Webhook).count() == 0


# ---------- Slack ----------


@pytest.fixture
def slack(monkeypatch):
    posts = []
    monkeypatch.setattr(settings, "ENABLE_SLACK_NOTIFICATIONS", True)
    monkeypatch.setattr(settings, "SLACK_WEBHOOK_URL", "https://hooks.slack.test/T/B/x")
    monkeypatch.setattr(slack_service, "post", lambda text: posts.append(text))
    return posts


def test_slack_off_by_default(client, seeded, auth_headers, monkeypatch):
    posts = []
    monkeypatch.setattr(slack_service, "post", lambda text: posts.append(text))
    make_ticket(client, auth_headers, seeded.id)
    assert posts == []


def test_slack_messages(client, seeded, auth_headers, admin_auth_headers, slack):
    tid = make_ticket(client, auth_headers, seeded.id, title="Printer <b>jam</b> & more")
    assert len(slack) == 1
    msg = slack[0]
    assert msg.startswith("*New ticket:*") and f"#{tid}" in msg
    assert "&lt;b&gt;jam&lt;/b&gt; &amp; more" in msg  # Slack control characters are escaped
    assert f"/tickets/{tid}" in msg and "by John Smith" in msg
    slack.clear()
    client.patch(
        f"{BASE}/tickets/{tid}", json={"status": "in_progress"}, headers=admin_auth_headers
    )
    assert "open → in_progress" in slack[0]
    slack.clear()
    client.post(
        f"{BASE}/tickets/{tid}/comments", json={"content": "chatter"}, headers=admin_auth_headers
    )
    assert slack == []  # comments are not posted to Slack


def test_slack_failure_is_swallowed(monkeypatch):
    monkeypatch.setattr(settings, "SLACK_WEBHOOK_URL", "https://hooks.slack.test/x")

    def boom(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "post", boom)
    slack_service.post("hello")  # must not raise
