"""Phase 3: SLA rules, manager approval, feedback survey, knowledge base."""
from datetime import timedelta
from datetime import datetime

import pytest

from app.config import settings
from app.models.category import TicketSubcategory
from app.models.ticket import Ticket
from app.services import notification_service as notify_mod

BASE = "/api/helpdesk"


def make(client, headers, category_id, **kw):
    payload = {"title": "Need access", "description": "Please", "category_id": category_id}
    payload.update(kw)
    r = client.post(f"{BASE}/tickets", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def sub_id(db, name):
    return db.query(TicketSubcategory).filter_by(name=name).one()


def access_ticket(client, db, seeded, headers):
    sub = sub_id(db, "Access request")
    return make(client, headers, sub.category_id, subcategory_id=sub.id)


def decide(client, headers, tid, decision="approve", comment=None):
    return client.post(
        f"{BASE}/tickets/{tid}/approval",
        json={"decision": decision, "comment": comment},
        headers=headers,
    )


def move(client, headers, tid, status):
    return client.patch(f"{BASE}/tickets/{tid}", json={"status": status}, headers=headers)


# ---------- SLA rules ----------


def test_sla_rules_default_custom_and_reset(client, db, seeded, auth_headers, admin_auth_headers):
    rules = client.get(f"{BASE}/sla-rules", headers=admin_auth_headers).json()
    assert len(rules) == 4 and not any(r["custom"] for r in rules)
    assert rules[0]["response_hours"] == settings.SLA_RESPONSE_TIME_HOURS

    cat = seeded.id
    put = client.put(
        f"{BASE}/sla-rules/{cat}",
        json={"response_hours": 2, "resolution_hours": 8},
        headers=admin_auth_headers,
    )
    assert put.status_code == 200
    row = next(r for r in put.json() if r["category_id"] == cat)
    assert (row["response_hours"], row["resolution_hours"], row["custom"]) == (2, 8, True)

    t = make(client, auth_headers, cat)
    created = datetime.fromisoformat(t["created_at"])
    assert datetime.fromisoformat(t["sla_response_due"]) - created == timedelta(hours=2)
    assert datetime.fromisoformat(t["sla_resolution_due"]) - created == timedelta(hours=8)

    other = make(client, auth_headers, cat + 1)
    gap = datetime.fromisoformat(other["sla_response_due"]) - datetime.fromisoformat(
        other["created_at"]
    )
    assert gap == timedelta(hours=settings.SLA_RESPONSE_TIME_HOURS)

    assert client.delete(f"{BASE}/sla-rules/{cat}", headers=admin_auth_headers).status_code == 204
    again = next(
        r
        for r in client.get(f"{BASE}/sla-rules", headers=admin_auth_headers).json()
        if r["category_id"] == cat
    )
    assert again["custom"] is False


def test_sla_rule_validation_and_access(client, seeded, tech_headers, admin_auth_headers):
    url = f"{BASE}/sla-rules/{seeded.id}"
    body = {"response_hours": 10, "resolution_hours": 5}
    assert client.put(url, json=body, headers=admin_auth_headers).status_code == 422
    assert (
        client.put(
            f"{BASE}/sla-rules/999",
            json={"response_hours": 1, "resolution_hours": 2},
            headers=admin_auth_headers,
        ).status_code
        == 404
    )
    assert (
        client.put(
            url, json={"response_hours": 0, "resolution_hours": 2}, headers=admin_auth_headers
        ).status_code
        == 422
    )
    assert client.get(f"{BASE}/sla-rules", headers=tech_headers).status_code == 403
    assert (
        client.put(
            url, json={"response_hours": 1, "resolution_hours": 2}, headers=tech_headers
        ).status_code
        == 403
    )


# ---------- approvals ----------


def test_only_flagged_subcategories_need_approval(client, db, seeded, auth_headers):
    plain = make(client, auth_headers, seeded.id)
    assert plain["approval_status"] is None
    t = access_ticket(client, db, seeded, auth_headers)
    assert (t["approval_status"], t["approver_id"]) == ("pending", "manager-1")
    subs = client.get(f"{BASE}/categories/{seeded.id}/subcategories", headers=auth_headers).json()
    assert {s["name"] for s in subs if s["requires_approval"]} == {
        "Access request",
        "License assignment",
    }


def test_pending_ticket_is_blocked_until_approved(
    client, db, seeded, auth_headers, manager_headers, admin_auth_headers
):
    tid = access_ticket(client, db, seeded, auth_headers)["id"]
    blocked = move(client, admin_auth_headers, tid, "in_progress")
    assert blocked.status_code == 409 and "approval" in blocked.json()["detail"]

    assert client.get(f"{BASE}/tickets/{tid}", headers=manager_headers).status_code == 200
    pending = client.get(f"{BASE}/approvals", headers=manager_headers).json()
    assert [t["id"] for t in pending] == [tid]
    assert client.get(f"{BASE}/approvals", headers=auth_headers).json() == []
    assert [
        t["id"] for t in client.get(f"{BASE}/approvals", headers=admin_auth_headers).json()
    ] == [tid]

    r = decide(client, manager_headers, tid, "approve", "ok by me")
    assert r.status_code == 200
    body = r.json()
    assert (body["approval_status"], body["approval_decided_by_id"], body["approval_comment"]) == (
        "approved",
        "manager-1",
        "ok by me",
    )
    assert move(client, admin_auth_headers, tid, "in_progress").status_code == 200
    assert client.get(f"{BASE}/approvals", headers=manager_headers).json() == []
    assert decide(client, manager_headers, tid).status_code == 409  # already decided


def test_rejection_cancels_the_ticket(
    client, db, seeded, auth_headers, manager_headers, admin_auth_headers
):
    tid = access_ticket(client, db, seeded, auth_headers)["id"]
    body = decide(client, manager_headers, tid, "reject", "not needed").json()
    assert (body["approval_status"], body["status"]) == ("rejected", "cancelled")
    hist = client.get(f"{BASE}/tickets/{tid}/history", headers=admin_auth_headers).json()
    assert {"approval_requested", "approval_rejected"} <= {h["change_type"] for h in hist}


def test_cancel_allowed_while_pending(client, db, seeded, auth_headers, admin_auth_headers):
    tid = access_ticket(client, db, seeded, auth_headers)["id"]
    assert move(client, admin_auth_headers, tid, "cancelled").status_code == 200


def test_approval_permissions(
    client,
    db,
    seeded,
    auth_headers,
    user2_headers,
    tech_headers,
    manager_headers,
    admin_auth_headers,
):
    tid = access_ticket(client, db, seeded, auth_headers)["id"]
    assert decide(client, user2_headers, tid).status_code == 404  # cannot even see it
    assert decide(client, tech_headers, tid).status_code == 404
    # the requester cannot approve their own request
    assert decide(client, auth_headers, tid).status_code == 403
    assert (
        client.post(
            f"{BASE}/tickets/{tid}/approval", json={"decision": "maybe"}, headers=manager_headers
        ).status_code
        == 422
    )
    # admin may override
    assert decide(client, admin_auth_headers, tid).status_code == 200


def test_admin_cannot_self_approve(client, db, seeded, admin_auth_headers):
    tid = access_ticket(client, db, seeded, admin_auth_headers)["id"]
    assert decide(client, admin_auth_headers, tid).status_code == 403


def test_no_manager_means_admin_decides(
    client, db, seeded, tech_headers, manager_headers, admin_auth_headers
):
    t = access_ticket(client, db, seeded, tech_headers)  # tech-1 has no manager in the directory
    assert t["approval_status"] == "pending" and t["approver_id"] is None
    assert client.get(f"{BASE}/tickets/{t['id']}", headers=manager_headers).status_code == 404
    assert decide(client, admin_auth_headers, t["id"]).status_code == 200


def test_decision_on_ticket_without_approval(client, seeded, auth_headers, admin_auth_headers):
    tid = make(client, auth_headers, seeded.id)["id"]
    assert decide(client, admin_auth_headers, tid).status_code == 409


def test_approval_emails(client, db, seeded, auth_headers, manager_headers, monkeypatch):
    sent = []
    monkeypatch.setattr(
        notify_mod, "send_email", lambda to, subject, body: sent.append((to, subject))
    )
    monkeypatch.setattr(settings, "ENABLE_EMAIL_NOTIFICATIONS", True)
    tid = access_ticket(client, db, seeded, auth_headers)["id"]
    assert "maria.manager@company.com" in [
        to for to, subject in sent if "Approval needed" in subject
    ]
    sent.clear()
    decide(client, manager_headers, tid, "reject", "no")
    assert [to for to, _ in sent] == ["john.smith@company.com"]
    assert "rejected" in sent[0][1]


# ---------- feedback ----------


def resolve(client, admin_headers, tid):
    for s in ("in_progress", "resolved"):
        assert move(client, admin_headers, tid, s).status_code == 200


def test_feedback_flow(client, seeded, auth_headers, user2_headers, admin_auth_headers):
    tid = make(client, auth_headers, seeded.id, title="Printer")["id"]
    url = f"{BASE}/tickets/{tid}/feedback"
    assert (
        client.post(url, json={"rating": 5}, headers=auth_headers).status_code == 409
    )  # not resolved
    resolve(client, admin_auth_headers, tid)

    assert client.post(url, json={"rating": 6}, headers=auth_headers).status_code == 422
    assert client.post(url, json={"rating": 0}, headers=auth_headers).status_code == 422
    assert client.post(url, json={"rating": 4}, headers=user2_headers).status_code == 404
    assert client.post(url, json={"rating": 4}, headers=admin_auth_headers).status_code == 403

    ok = client.post(url, json={"rating": 4, "comment": "fast"}, headers=auth_headers)
    assert ok.status_code == 201 and ok.json()["rating"] == 4
    assert client.post(url, json={"rating": 1}, headers=auth_headers).status_code == 409
    detail = client.get(f"{BASE}/tickets/{tid}", headers=auth_headers).json()
    assert detail["feedback"]["comment"] == "fast"
    assert (
        client.get(f"{BASE}/tickets/{tid}", headers=admin_auth_headers).json()["feedback"]["rating"]
        == 4
    )


def test_feedback_in_report(client, seeded, auth_headers, user2_headers, admin_auth_headers):
    empty = client.get(f"{BASE}/reports", headers=admin_auth_headers).json()
    assert empty["feedback_count"] == 0 and empty["avg_satisfaction"] is None
    for headers, rating in ((auth_headers, 5), (user2_headers, 2)):
        tid = make(client, headers, seeded.id)["id"]
        resolve(client, admin_auth_headers, tid)
        client.post(f"{BASE}/tickets/{tid}/feedback", json={"rating": rating}, headers=headers)
    r = client.get(f"{BASE}/reports", headers=admin_auth_headers).json()
    assert (r["feedback_count"], r["avg_satisfaction"]) == (2, 3.5)
    assert r["pending_approval"] == 0


def test_feedback_allowed_after_close(client, seeded, auth_headers, admin_auth_headers):
    tid = make(client, auth_headers, seeded.id)["id"]
    resolve(client, admin_auth_headers, tid)
    move(client, admin_auth_headers, tid, "closed")
    assert (
        client.post(
            f"{BASE}/tickets/{tid}/feedback", json={"rating": 3}, headers=auth_headers
        ).status_code
        == 201
    )


# ---------- knowledge base ----------


def article(client, headers, **kw):
    body = {
        "title": "Reset your password",
        "body": "Use the self service portal.",
        "published": True,
    }
    body.update(kw)
    r = client.post(f"{BASE}/kb/articles", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_kb_permissions_and_visibility(client, auth_headers, tech_headers, admin_auth_headers):
    body = {"title": "t", "body": "b"}
    assert client.post(f"{BASE}/kb/articles", json=body, headers=auth_headers).status_code == 403
    assert client.post(f"{BASE}/kb/articles", json=body, headers=tech_headers).status_code == 403
    pub = article(client, admin_auth_headers, title="Published one")
    draft = article(client, admin_auth_headers, title="Draft one", published=False)

    def ids(headers):
        r = client.get(f"{BASE}/kb/articles", headers=headers).json()
        return {a["id"] for a in r["items"]}

    assert ids(auth_headers) == {pub["id"]}
    assert ids(tech_headers) == ids(admin_auth_headers) == {pub["id"], draft["id"]}
    assert client.get(f"{BASE}/kb/articles/{draft['id']}", headers=auth_headers).status_code == 404
    assert client.get(f"{BASE}/kb/articles/{draft['id']}", headers=tech_headers).status_code == 200


def test_kb_update_publish_and_delete(client, auth_headers, admin_auth_headers):
    a = article(client, admin_auth_headers, published=False)
    url = f"{BASE}/kb/articles/{a['id']}"
    assert client.get(url, headers=auth_headers).status_code == 404
    r = client.patch(
        url, json={"published": True, "tags": "password,account"}, headers=admin_auth_headers
    )
    assert r.json()["published"] is True and r.json()["tags"] == "password,account"
    assert client.get(url, headers=auth_headers).status_code == 200
    assert client.patch(url, json={"title": ""}, headers=admin_auth_headers).status_code == 422
    assert client.delete(url, headers=auth_headers).status_code == 403
    assert client.delete(url, headers=admin_auth_headers).status_code == 204
    assert client.get(url, headers=admin_auth_headers).status_code == 404


def test_kb_search_ranking_and_paging(client, seeded, auth_headers, admin_auth_headers):
    body_only = article(
        client, admin_auth_headers, title="General tips", body="how to fix the vpn quickly"
    )
    title_hit = article(client, admin_auth_headers, title="VPN troubleshooting", body="steps")
    tagged = article(
        client, admin_auth_headers, title="Remote work", body="misc", tags="vpn,remote"
    )
    article(client, admin_auth_headers, title="Printers", body="toner")

    def search(qs):
        return client.get(f"{BASE}/kb/articles?{qs}", headers=auth_headers).json()

    r = search("q=vpn")
    assert [a["id"] for a in r["items"]] == [title_hit["id"], tagged["id"], body_only["id"]]
    assert r["total"] == 3
    assert search("q=zzzz")["total"] == 0
    assert search("")["total"] == 4
    page2 = search("page=2&page_size=3")
    assert len(page2["items"]) == 1 and page2["total"] == 4
    scoped = article(client, admin_auth_headers, title="Cat article", category_id=seeded.id)
    assert [a["id"] for a in search(f"category_id={seeded.id}")["items"]] == [scoped["id"]]


def test_kb_suggest_only_published_and_prefers_category(
    client, seeded, auth_headers, admin_auth_headers
):
    article(client, admin_auth_headers, title="Draft vpn", published=False)
    generic = article(client, admin_auth_headers, title="VPN guide", body="connect")
    cat = article(
        client,
        admin_auth_headers,
        title="VPN guide for category",
        body="connect",
        category_id=seeded.id,
    )
    r = client.get(
        f"{BASE}/kb/suggest?q=vpn problem&category_id={seeded.id}", headers=auth_headers
    ).json()
    assert [a["id"] for a in r] == [cat["id"], generic["id"]]
    assert client.get(f"{BASE}/kb/suggest?q=ab", headers=auth_headers).status_code == 422
    assert (
        client.get(f"{BASE}/kb/suggest?q=nothing matches here", headers=auth_headers).json() == []
    )


def test_kb_ticket_links(
    client, seeded, auth_headers, user2_headers, tech_headers, tech2_headers, admin_auth_headers
):
    a = article(client, admin_auth_headers)
    draft = article(client, admin_auth_headers, title="Hidden", published=False)
    tid = make(client, auth_headers, seeded.id)["id"]
    url = f"{BASE}/tickets/{tid}/kb"

    assert client.post(url, json={"article_id": a["id"]}, headers=auth_headers).status_code == 403
    assert (
        client.post(url, json={"article_id": a["id"]}, headers=tech_headers).status_code == 404
    )  # not assigned
    client.put(
        f"{BASE}/tickets/{tid}/assignee", json={"assignee_id": "tech-1"}, headers=admin_auth_headers
    )
    assert (
        client.post(url, json={"article_id": draft["id"]}, headers=tech_headers).status_code == 404
    )
    assert client.post(url, json={"article_id": 999}, headers=tech_headers).status_code == 404
    linked = client.post(url, json={"article_id": a["id"]}, headers=tech_headers)
    assert [x["id"] for x in linked.json()] == [a["id"]]
    assert (
        len(client.post(url, json={"article_id": a["id"]}, headers=tech_headers).json()) == 1
    )  # idempotent

    assert [x["id"] for x in client.get(url, headers=auth_headers).json()] == [a["id"]]
    assert client.get(url, headers=user2_headers).status_code == 404
    hist = client.get(f"{BASE}/tickets/{tid}/history", headers=admin_auth_headers).json()
    assert sum(h["change_type"] == "kb_linked" for h in hist) == 1

    assert client.delete(f"{url}/{a['id']}", headers=tech2_headers).status_code == 404
    assert client.delete(f"{url}/{a['id']}", headers=tech_headers).json() == []


def test_unpublishing_hides_linked_article_from_submitter(
    client, seeded, auth_headers, admin_auth_headers
):
    a = article(client, admin_auth_headers)
    tid = make(client, auth_headers, seeded.id)["id"]
    client.post(
        f"{BASE}/tickets/{tid}/kb", json={"article_id": a["id"]}, headers=admin_auth_headers
    )
    client.patch(
        f"{BASE}/kb/articles/{a['id']}", json={"published": False}, headers=admin_auth_headers
    )
    assert client.get(f"{BASE}/tickets/{tid}/kb", headers=auth_headers).json() == []
    assert len(client.get(f"{BASE}/tickets/{tid}/kb", headers=admin_auth_headers).json()) == 1
