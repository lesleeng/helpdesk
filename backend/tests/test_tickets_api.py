"""API tests for tickets, status flow, comments, attachments, categories, dashboard."""
from datetime import datetime, timedelta

import pytest

from app.models.ticket import Ticket

BASE = "/api/helpdesk"


def make_ticket(client, headers, category_id, **overrides):
    payload = {"title": "Printer jammed", "description": "Floor 2", "category_id": category_id}
    payload.update(overrides)
    return client.post(f"{BASE}/tickets", json=payload, headers=headers)


def set_status(client, admin_headers, ticket_id, new_status):
    return client.patch(
        f"{BASE}/tickets/{ticket_id}", json={"status": new_status}, headers=admin_headers
    )


def test_requires_auth(client):
    assert client.get(f"{BASE}/tickets").status_code == 401


def test_categories_and_subcategories(client, seeded, auth_headers):
    cats = client.get(f"{BASE}/categories", headers=auth_headers).json()
    assert len(cats) == 4
    subs = client.get(f"{BASE}/categories/{cats[0]['id']}/subcategories", headers=auth_headers)
    assert subs.status_code == 200 and len(subs.json()) > 0
    assert (
        client.get(f"{BASE}/categories/999/subcategories", headers=auth_headers).status_code == 404
    )


def test_create_ticket_with_extra_fields(client, seeded, auth_headers):
    r = make_ticket(
        client, auth_headers, seeded.id, urgency="high", extra_fields={"software_name": "Zoom"}
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "open" and body["user_id"] == "user-1"
    assert body["extra_fields"] == [{"field_name": "software_name", "field_value": "Zoom"}]


def test_create_ticket_validation(client, seeded, auth_headers):
    assert make_ticket(client, auth_headers, 999).status_code == 422
    other_cat_sub = seeded.subcategories[0].id
    r = make_ticket(client, auth_headers, seeded.id + 1, subcategory_id=other_cat_sub)
    assert r.status_code == 422
    assert make_ticket(client, auth_headers, seeded.id, title="").status_code == 422


def test_list_scoping_and_filters(client, seeded, auth_headers, user2_headers, admin_auth_headers):
    make_ticket(client, auth_headers, seeded.id, title="Alpha")
    make_ticket(client, user2_headers, seeded.id, title="Beta")
    mine = client.get(f"{BASE}/tickets", headers=auth_headers).json()
    assert mine["total"] == 1 and mine["items"][0]["title"] == "Alpha"
    assert client.get(f"{BASE}/tickets", headers=admin_auth_headers).json()["total"] == 2
    found = client.get(f"{BASE}/tickets?search=beta", headers=admin_auth_headers).json()
    assert found["total"] == 1
    none = client.get(f"{BASE}/tickets?status=closed", headers=admin_auth_headers).json()
    assert none["total"] == 0
    paged = client.get(f"{BASE}/tickets?page_size=1&page=2", headers=admin_auth_headers).json()
    assert len(paged["items"]) == 1 and paged["total"] == 2


def test_user_cannot_see_others_ticket(client, seeded, auth_headers, user2_headers):
    tid = make_ticket(client, auth_headers, seeded.id).json()["id"]
    assert client.get(f"{BASE}/tickets/{tid}", headers=user2_headers).status_code == 404
    assert client.get(f"{BASE}/tickets/{tid}", headers=auth_headers).status_code == 200


def test_patch_is_admin_only(client, seeded, auth_headers):
    tid = make_ticket(client, auth_headers, seeded.id).json()["id"]
    assert set_status(client, auth_headers, tid, "in_progress").status_code == 403


def test_status_flow_and_history(client, seeded, auth_headers, admin_auth_headers):
    tid = make_ticket(client, auth_headers, seeded.id).json()["id"]
    for s in ["in_progress", "on_hold", "in_progress", "resolved", "closed"]:
        assert set_status(client, admin_auth_headers, tid, s).status_code == 200, s
    t = client.get(f"{BASE}/tickets/{tid}", headers=auth_headers).json()
    assert t["resolved_at"] and t["closed_at"]
    hist = client.get(f"{BASE}/tickets/{tid}/history", headers=admin_auth_headers).json()
    assert [h["new_value"] for h in hist if h["change_type"] == "status_change"] == [
        "in_progress",
        "on_hold",
        "in_progress",
        "resolved",
        "closed",
    ]
    assert client.get(f"{BASE}/tickets/{tid}/history", headers=auth_headers).status_code == 403


def test_invalid_transitions(client, seeded, auth_headers, admin_auth_headers):
    tid = make_ticket(client, auth_headers, seeded.id).json()["id"]
    assert set_status(client, admin_auth_headers, tid, "resolved").status_code == 409
    set_status(client, admin_auth_headers, tid, "cancelled")
    assert set_status(client, admin_auth_headers, tid, "open").status_code == 409


def test_closed_cannot_revert(client, seeded, auth_headers, admin_auth_headers):
    tid = make_ticket(client, auth_headers, seeded.id).json()["id"]
    for s in ["in_progress", "resolved", "closed"]:
        set_status(client, admin_auth_headers, tid, s)
    assert set_status(client, admin_auth_headers, tid, "in_progress").status_code == 409
    assert client.post(f"{BASE}/tickets/{tid}/reopen", headers=auth_headers).status_code == 409


def test_priority_change_logged(client, seeded, auth_headers, admin_auth_headers):
    tid = make_ticket(client, auth_headers, seeded.id).json()["id"]
    r = client.patch(
        f"{BASE}/tickets/{tid}", json={"priority": "urgent"}, headers=admin_auth_headers
    )
    assert r.json()["priority"] == "urgent"
    hist = client.get(f"{BASE}/tickets/{tid}/history", headers=admin_auth_headers).json()
    assert any(h["change_type"] == "priority_change" for h in hist)


def test_reopen_within_and_after_window(client, db, seeded, auth_headers, admin_auth_headers):
    tid = make_ticket(client, auth_headers, seeded.id).json()["id"]
    for s in ["in_progress", "resolved"]:
        set_status(client, admin_auth_headers, tid, s)
    r = client.post(f"{BASE}/tickets/{tid}/reopen", headers=auth_headers)
    assert r.status_code == 200 and r.json()["status"] == "open" and r.json()["reopen_count"] == 1

    for s in ["in_progress", "resolved"]:
        set_status(client, admin_auth_headers, tid, s)
    ticket = db.get(Ticket, tid)
    ticket.resolved_at = datetime.utcnow() - timedelta(days=30)
    db.commit()
    assert client.post(f"{BASE}/tickets/{tid}/reopen", headers=auth_headers).status_code == 409


def test_reopen_other_users_ticket_404(
    client, seeded, auth_headers, user2_headers, admin_auth_headers
):
    tid = make_ticket(client, auth_headers, seeded.id).json()["id"]
    for s in ["in_progress", "resolved"]:
        set_status(client, admin_auth_headers, tid, s)
    assert client.post(f"{BASE}/tickets/{tid}/reopen", headers=user2_headers).status_code == 404


def test_comments_and_internal_notes(
    client, seeded, auth_headers, user2_headers, admin_auth_headers
):
    tid = make_ticket(client, auth_headers, seeded.id).json()["id"]
    url = f"{BASE}/tickets/{tid}/comments"
    assert (
        client.post(url, json={"content": "Any update?"}, headers=auth_headers).status_code == 201
    )
    assert (
        client.post(
            url, json={"content": "secret", "is_internal": True}, headers=auth_headers
        ).status_code
        == 403
    )
    assert (
        client.post(
            url, json={"content": "triaging", "is_internal": True}, headers=admin_auth_headers
        ).status_code
        == 201
    )
    assert len(client.get(url, headers=auth_headers).json()) == 1
    assert len(client.get(url, headers=admin_auth_headers).json()) == 2
    assert client.get(url, headers=user2_headers).status_code == 404
    assert client.post(url, json={"content": ""}, headers=auth_headers).status_code == 422


def test_attachment_upload(client, seeded, auth_headers, tmp_path, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    tid = make_ticket(client, auth_headers, seeded.id).json()["id"]
    url = f"{BASE}/tickets/{tid}/attachments"
    r = client.post(
        url, files={"file": ("../../evil.txt", b"hello", "text/plain")}, headers=auth_headers
    )
    assert r.status_code == 201
    body = r.json()
    assert body["file_name"] == "evil.txt" and body["file_size"] == 5
    assert len(list((tmp_path / str(tid)).iterdir())) == 1

    bad = client.post(
        url, files={"file": ("run.exe", b"x", "application/octet-stream")}, headers=auth_headers
    )
    assert bad.status_code == 422

    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_MB", 0)
    big = client.post(url, files={"file": ("a.txt", b"x", "text/plain")}, headers=auth_headers)
    assert big.status_code == 413


def test_dashboard(client, seeded, auth_headers, admin_auth_headers):
    t1 = make_ticket(client, auth_headers, seeded.id).json()["id"]
    make_ticket(client, auth_headers, seeded.id)
    for s in ["in_progress", "resolved"]:
        set_status(client, admin_auth_headers, t1, s)
    d = client.get(f"{BASE}/dashboard", headers=admin_auth_headers).json()
    assert d["total"] == 2
    assert d["by_status"] == {"resolved": 1, "open": 1}
    assert d["by_category"] == {seeded.name: 2}
    assert d["avg_resolution_hours"] is not None
    assert client.get(f"{BASE}/dashboard", headers=auth_headers).status_code == 403
