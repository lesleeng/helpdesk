"""Phase 2: tech staff, assignment, SLA, bulk actions, filters, report, notifications."""
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException

from app.config import settings
from app.models.ticket import Ticket
from app.services import directory
from app.services import notification_service as notify_mod

BASE = "/api/helpdesk"


def make(client, headers, category_id, **kw):
    payload = {"title": "Printer jammed", "description": "Floor 2", "category_id": category_id}
    payload.update(kw)
    r = client.post(f"{BASE}/tickets", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def assign(client, admin_headers, tid, assignee):
    return client.put(
        f"{BASE}/tickets/{tid}/assignee", json={"assignee_id": assignee}, headers=admin_headers
    )


def patch(client, headers, tid, **body):
    return client.patch(f"{BASE}/tickets/{tid}", json=body, headers=headers)


# ---------- tech staff access ----------


def test_tech_only_sees_assigned_tickets(
    client, seeded, auth_headers, admin_auth_headers, tech_headers, tech2_headers
):
    tid = make(client, auth_headers, seeded.id)
    other = make(client, auth_headers, seeded.id, title="Other")
    assert client.get(f"{BASE}/tickets", headers=tech_headers).json()["total"] == 0
    assert client.get(f"{BASE}/tickets/{tid}", headers=tech_headers).status_code == 404

    assert assign(client, admin_auth_headers, tid, "tech-1").status_code == 200
    listed = client.get(f"{BASE}/tickets", headers=tech_headers).json()
    assert [t["id"] for t in listed["items"]] == [tid]
    assert client.get(f"{BASE}/tickets/{tid}", headers=tech_headers).status_code == 200
    assert client.get(f"{BASE}/tickets/{other}", headers=tech_headers).status_code == 404
    assert client.get(f"{BASE}/tickets/{tid}", headers=tech2_headers).status_code == 404


def test_tech_can_work_assigned_ticket(
    client, seeded, auth_headers, admin_auth_headers, tech_headers, tech2_headers
):
    tid = make(client, auth_headers, seeded.id)
    assign(client, admin_auth_headers, tid, "tech-1")
    assert patch(client, tech_headers, tid, status="in_progress").status_code == 200
    assert patch(client, tech2_headers, tid, status="on_hold").status_code == 404
    assert client.get(f"{BASE}/tickets/{tid}/history", headers=tech_headers).status_code == 200
    note = client.post(
        f"{BASE}/tickets/{tid}/comments",
        json={"content": "checking", "is_internal": True},
        headers=tech_headers,
    )
    assert note.status_code == 201
    # the submitter never sees internal notes
    assert client.get(f"{BASE}/tickets/{tid}/comments", headers=auth_headers).json() == []


def test_tech_cannot_use_admin_features(
    client, seeded, auth_headers, admin_auth_headers, tech_headers
):
    tid = make(client, auth_headers, seeded.id)
    assign(client, admin_auth_headers, tid, "tech-1")
    assert assign(client, tech_headers, tid, "tech-1").status_code == 403
    bulk = client.post(f"{BASE}/tickets/bulk", json={"ticket_ids": [tid]}, headers=tech_headers)
    assert bulk.status_code == 403
    for path in ("/reports", "/dashboard", "/staff"):
        assert client.get(f"{BASE}{path}", headers=tech_headers).status_code == 403


def test_tech_own_unassigned_ticket_is_not_manageable(client, seeded, tech_headers):
    tid = make(client, tech_headers, seeded.id)
    assert client.get(f"{BASE}/tickets/{tid}", headers=tech_headers).status_code == 200
    assert patch(client, tech_headers, tid, status="in_progress").status_code == 404


def test_regular_user_cannot_patch_or_see_history(client, seeded, auth_headers):
    tid = make(client, auth_headers, seeded.id)
    assert patch(client, auth_headers, tid, status="in_progress").status_code == 403
    assert client.get(f"{BASE}/tickets/{tid}/history", headers=auth_headers).status_code == 403


# ---------- assignment ----------


def test_assign_unassign_and_history(client, seeded, auth_headers, admin_auth_headers):
    tid = make(client, auth_headers, seeded.id)
    r = assign(client, admin_auth_headers, tid, "tech-1").json()
    assert r["assigned_to_id"] == "tech-1" and r["assigned_at"]
    assert assign(client, admin_auth_headers, tid, "nobody").status_code == 422
    assert assign(client, admin_auth_headers, tid, None).json()["assigned_to_id"] is None
    hist = client.get(f"{BASE}/tickets/{tid}/history", headers=admin_auth_headers).json()
    changes = [(h["old_value"], h["new_value"]) for h in hist if h["change_type"] == "assigned"]
    assert changes == [(None, "tech-1"), ("tech-1", None)]


def test_staff_list(client, admin_auth_headers, auth_headers):
    staff = client.get(f"{BASE}/staff", headers=admin_auth_headers).json()
    assert {s["id"] for s in staff} == {"tech-1", "tech-2", "admin-1"}
    assert client.get(f"{BASE}/staff", headers=auth_headers).status_code == 403


def test_directory_production_mode_is_explicit(monkeypatch):
    monkeypatch.setattr(settings, "AUTH_MODE", "production")
    assert directory.get_user("tech-1") is None
    with pytest.raises(HTTPException) as exc:
        directory.list_staff()
    assert exc.value.status_code == 501


# ---------- SLA ----------


def set_times(db, tid, **cols):
    t = db.get(Ticket, tid)
    for k, v in cols.items():
        setattr(t, k, v)
    db.commit()


def test_sla_due_dates_and_first_response(client, db, seeded, auth_headers, admin_auth_headers):
    tid = make(client, auth_headers, seeded.id)
    t = client.get(f"{BASE}/tickets/{tid}", headers=auth_headers).json()
    assert t["sla_status"] == "ok" and t["first_response_at"] is None
    due = datetime.fromisoformat(t["sla_response_due"]) - datetime.fromisoformat(t["created_at"])
    assert due == timedelta(hours=settings.SLA_RESPONSE_TIME_HOURS)

    # the submitter's own comment and internal notes are not a response
    client.post(f"{BASE}/tickets/{tid}/comments", json={"content": "hi"}, headers=auth_headers)
    client.post(
        f"{BASE}/tickets/{tid}/comments",
        json={"content": "n", "is_internal": True},
        headers=admin_auth_headers,
    )
    assert (
        client.get(f"{BASE}/tickets/{tid}", headers=auth_headers).json()["first_response_at"]
        is None
    )
    client.post(
        f"{BASE}/tickets/{tid}/comments", json={"content": "on it"}, headers=admin_auth_headers
    )
    assert client.get(f"{BASE}/tickets/{tid}", headers=auth_headers).json()["first_response_at"]


def test_first_response_from_status_change(client, seeded, auth_headers, admin_auth_headers):
    tid = make(client, auth_headers, seeded.id)
    patch(client, admin_auth_headers, tid, status="in_progress")
    assert client.get(f"{BASE}/tickets/{tid}", headers=auth_headers).json()["first_response_at"]


def test_sla_states(client, db, seeded, auth_headers, admin_auth_headers):
    now = datetime.utcnow()
    tid = make(client, auth_headers, seeded.id)
    state = lambda: client.get(f"{BASE}/tickets/{tid}", headers=auth_headers).json()["sla_status"]

    set_times(db, tid, sla_response_due=now - timedelta(hours=1))
    assert state() == "breached"

    set_times(
        db,
        tid,
        status="in_progress",
        first_response_at=now - timedelta(hours=90),
        created_at=now - timedelta(hours=100),
        sla_response_due=now - timedelta(hours=76),
        sla_resolution_due=now + timedelta(hours=1),
    )
    assert state() == "at_risk"

    patch(client, admin_auth_headers, tid, status="resolved")
    assert state() == "met"

    t2 = make(client, auth_headers, seeded.id)
    set_times(db, t2, sla_resolution_due=now - timedelta(hours=1), first_response_at=now)
    patch(client, admin_auth_headers, t2, status="in_progress")
    patch(client, admin_auth_headers, t2, status="resolved")
    assert (
        client.get(f"{BASE}/tickets/{t2}", headers=auth_headers).json()["sla_status"] == "breached"
    )


def test_sla_breached_filter(client, db, seeded, auth_headers, admin_auth_headers):
    ok = make(client, auth_headers, seeded.id, title="fine")
    late = make(client, auth_headers, seeded.id, title="late")
    set_times(db, late, sla_resolution_due=datetime.utcnow() - timedelta(hours=1))
    r = client.get(f"{BASE}/tickets?sla_breached=true", headers=admin_auth_headers).json()
    assert [t["id"] for t in r["items"]] == [late] and ok != late


# ---------- filters ----------


def test_advanced_filters(client, db, seeded, auth_headers, admin_auth_headers):
    a = make(client, auth_headers, seeded.id, title="A")
    b = make(client, auth_headers, seeded.id, title="B")
    assign(client, admin_auth_headers, a, "tech-1")
    patch(client, admin_auth_headers, b, priority="urgent")
    set_times(db, a, created_at=datetime(2026, 1, 10, 12, 0))

    def ids(qs):
        r = client.get(f"{BASE}/tickets?{qs}", headers=admin_auth_headers).json()
        return sorted(t["id"] for t in r["items"])

    assert ids("assignee_id=tech-1") == [a]
    assert ids("unassigned=true") == [b]
    assert ids("priority=urgent") == [b]
    assert ids("created_from=2026-01-10&created_to=2026-01-10") == [a]
    assert ids("created_from=2026-01-11") == [b]
    assert ids("created_to=2026-01-31") == [a]


# ---------- bulk ----------


def test_bulk_update_partial_failure(client, seeded, auth_headers, admin_auth_headers):
    t1, t2, t3 = (make(client, auth_headers, seeded.id) for _ in range(3))
    for s in ("in_progress", "resolved", "closed"):
        patch(client, admin_auth_headers, t3, status=s)
    r = client.post(
        f"{BASE}/tickets/bulk",
        json={
            "ticket_ids": [t1, t2, t3, 999],
            "status": "in_progress",
            "priority": "high",
            "assignee_id": "tech-2",
        },
        headers=admin_auth_headers,
    ).json()
    assert r["updated"] == [t1, t2]
    assert {f["id"] for f in r["failed"]} == {t3, 999}
    for tid in (t1, t2):
        t = client.get(f"{BASE}/tickets/{tid}", headers=admin_auth_headers).json()
        assert (t["status"], t["priority"], t["assigned_to_id"]) == (
            "in_progress",
            "high",
            "tech-2",
        )
    closed = client.get(f"{BASE}/tickets/{t3}", headers=admin_auth_headers).json()
    assert closed["status"] == "closed"


def test_bulk_validates_input(client, seeded, auth_headers, admin_auth_headers):
    tid = make(client, auth_headers, seeded.id)
    r = client.post(f"{BASE}/tickets/bulk", json={"ticket_ids": []}, headers=admin_auth_headers)
    assert r.status_code == 422
    bad = client.post(
        f"{BASE}/tickets/bulk",
        json={"ticket_ids": [tid], "assignee_id": "ghost"},
        headers=admin_auth_headers,
    ).json()
    assert bad["updated"] == [] and bad["failed"][0]["reason"] == "Unknown staff member"


# ---------- report ----------


def test_report(client, db, seeded, auth_headers, admin_auth_headers):
    t1, t2, t3 = (make(client, auth_headers, seeded.id) for _ in range(3))
    assign(client, admin_auth_headers, t1, "tech-1")
    assign(client, admin_auth_headers, t2, "tech-1")
    for s in ("in_progress", "resolved"):
        patch(client, admin_auth_headers, t1, status=s)
    r = client.get(f"{BASE}/reports", headers=admin_auth_headers).json()
    assert r["open_count"] == 2 and r["resolved_count"] == 1
    assert r["unassigned_open"] == 1
    assert r["by_assignee"] == [{"assignee_id": "tech-1", "open": 1, "resolved": 1}]
    assert r["response_sla_met_pct"] == 100.0 and r["resolution_sla_met_pct"] == 100.0
    assert r["avg_resolution_hours"] is not None and r["avg_first_response_hours"] is not None
    assert t3  # unassigned, still open


def test_report_empty(client, admin_auth_headers):
    r = client.get(f"{BASE}/reports", headers=admin_auth_headers).json()
    assert r["open_count"] == 0 and r["avg_resolution_hours"] is None
    assert r["response_sla_met_pct"] is None and r["by_assignee"] == []


# ---------- notifications ----------


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(
        notify_mod, "send_email", lambda to, subject, body: sent.append((to, subject))
    )
    monkeypatch.setattr(settings, "EMAIL_ENABLED", True)
    return sent


def test_no_email_when_disabled(client, seeded, auth_headers, monkeypatch):
    sent = []
    monkeypatch.setattr(notify_mod, "send_email", lambda *a: sent.append(a))
    make(client, auth_headers, seeded.id)
    assert sent == []


def test_email_on_create(client, seeded, auth_headers, outbox):
    tid = make(client, auth_headers, seeded.id)
    assert sorted(to for to, _ in outbox) == ["admin@company.com", "john.smith@company.com"]
    assert all(f"#{tid}" in subject for _, subject in outbox)


def test_email_on_status_change_skips_actor(
    client, seeded, auth_headers, admin_auth_headers, outbox
):
    tid = make(client, auth_headers, seeded.id)
    assign(client, admin_auth_headers, tid, "tech-1")
    outbox.clear()
    patch(client, admin_auth_headers, tid, status="in_progress")
    assert sorted(to for to, _ in outbox) == ["john.smith@company.com", "tina.tech@company.com"]
    outbox.clear()
    patch(client, admin_auth_headers, tid, priority="high")  # no status change, no email
    assert outbox == []


def test_email_on_assignment(client, seeded, auth_headers, admin_auth_headers, outbox):
    tid = make(client, auth_headers, seeded.id)
    outbox.clear()
    assign(client, admin_auth_headers, tid, "tech-1")
    assert [to for to, _ in outbox] == ["tina.tech@company.com"]
    outbox.clear()
    assign(client, admin_auth_headers, tid, None)  # unassign: nobody to tell
    assert outbox == []


def test_email_on_comments(client, seeded, auth_headers, admin_auth_headers, outbox):
    tid = make(client, auth_headers, seeded.id)
    assign(client, admin_auth_headers, tid, "tech-1")
    outbox.clear()
    url = f"{BASE}/tickets/{tid}/comments"
    client.post(url, json={"content": "staff reply"}, headers=admin_auth_headers)
    assert sorted(to for to, _ in outbox) == ["john.smith@company.com", "tina.tech@company.com"]
    outbox.clear()
    client.post(url, json={"content": "note", "is_internal": True}, headers=admin_auth_headers)
    assert [to for to, _ in outbox] == ["tina.tech@company.com"]  # never the submitter
    outbox.clear()
    client.post(url, json={"content": "thanks"}, headers=auth_headers)
    assert sorted(to for to, _ in outbox) == ["tina.tech@company.com"]


def test_send_email_failure_is_swallowed(monkeypatch):
    import smtplib

    def boom(*a, **k):
        raise smtplib.SMTPConnectError(421, "down")

    monkeypatch.setattr(smtplib, "SMTP", boom)
    notify_mod.send_email("a@b.c", "s", "b")  # must not raise
