"""Analytics trends and CSV export."""
import csv
import io
from datetime import datetime, timedelta

from app.models.ticket import Ticket

BASE = "/api/helpdesk"


def make(client, headers, category_id, **kw):
    payload = {"title": "Printer jammed", "description": "Floor 2", "category_id": category_id}
    payload.update(kw)
    r = client.post(f"{BASE}/tickets", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def age(db, tid, created_days_ago=None, resolved_days_ago=None, **cols):
    now = datetime.utcnow()
    t = db.get(Ticket, tid)
    if created_days_ago is not None:
        t.created_at = now - timedelta(days=created_days_ago)
        t.sla_response_due = t.created_at + timedelta(hours=24)
        t.sla_resolution_due = t.created_at + timedelta(hours=72)
    if resolved_days_ago is not None:
        t.resolved_at = now - timedelta(days=resolved_days_ago)
        t.status = "resolved"
    for k, v in cols.items():
        setattr(t, k, v)
    db.commit()


def day(days_ago):
    return (datetime.utcnow() - timedelta(days=days_ago)).date().isoformat()


def get(client, headers, qs=""):
    r = client.get(f"{BASE}/analytics{qs}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_access_and_bounds(client, auth_headers, tech_headers, admin_auth_headers):
    for headers in (auth_headers, tech_headers):
        assert client.get(f"{BASE}/analytics", headers=headers).status_code == 403
        assert client.get(f"{BASE}/reports/tickets.csv", headers=headers).status_code == 403
    assert client.get(f"{BASE}/analytics?days=6", headers=admin_auth_headers).status_code == 422
    assert client.get(f"{BASE}/analytics?days=181", headers=admin_auth_headers).status_code == 422


def test_empty_database(client, admin_auth_headers):
    a = get(client, admin_auth_headers, "?days=14")
    assert len(a["volume"]) == 14 and sum(p["created"] for p in a["volume"]) == 0
    assert a["totals"] == {
        "created": 0,
        "resolved": 0,
        "avg_first_response_hours": None,
        "avg_resolution_hours": None,
        "reopen_rate_pct": None,
    }
    assert [b["count"] for b in a["backlog_age"]] == [0, 0, 0, 0]
    assert (
        a["sla_by_week"] == []
        and a["satisfaction_by_week"] == []
        and a["resolution_by_category"] == []
    )


def test_volume_is_one_point_per_day_oldest_first(
    client, db, seeded, auth_headers, admin_auth_headers
):
    t1, t2, t3 = (make(client, auth_headers, seeded.id) for _ in range(3))
    age(db, t1, created_days_ago=2)
    age(db, t2, created_days_ago=2, resolved_days_ago=1)
    age(db, t3, created_days_ago=5)
    old = make(client, auth_headers, seeded.id)
    age(db, old, created_days_ago=40)  # outside a 14 day window
    a = get(client, admin_auth_headers, "?days=14")
    vol = {p["date"]: p for p in a["volume"]}
    assert [p["date"] for p in a["volume"]] == sorted(vol) and a["volume"][-1]["date"] == day(0)
    assert vol[day(2)]["created"] == 2 and vol[day(5)]["created"] == 1
    assert vol[day(1)]["resolved"] == 1
    assert a["totals"]["created"] == 3 and a["totals"]["resolved"] == 1
    assert get(client, admin_auth_headers, "?days=60")["totals"]["created"] == 4


def test_backlog_age_only_counts_active_tickets(
    client, db, seeded, auth_headers, admin_auth_headers
):
    for days in (0.5, 2, 5, 10):
        age(db, make(client, auth_headers, seeded.id), created_days_ago=days)
    done = make(client, auth_headers, seeded.id)
    age(db, done, created_days_ago=10, resolved_days_ago=1)
    cancelled = make(client, auth_headers, seeded.id)
    age(db, cancelled, created_days_ago=10, status="cancelled")
    buckets = {b["bucket"]: b["count"] for b in get(client, admin_auth_headers)["backlog_age"]}
    assert buckets == {"Under 1 day": 1, "1-3 days": 1, "3-7 days": 1, "Over 7 days": 1}


def test_resolution_time_by_category(client, db, seeded, auth_headers, admin_auth_headers):
    a = make(client, auth_headers, seeded.id)
    b = make(client, auth_headers, seeded.id)
    age(db, a, created_days_ago=3, resolved_days_ago=2)  # 24h
    age(db, b, created_days_ago=3, resolved_days_ago=1)  # 48h
    c = get(client, admin_auth_headers)
    assert c["resolution_by_category"] == [
        {"category": seeded.name, "avg_hours": 36.0, "resolved": 2}
    ]
    assert c["totals"]["avg_resolution_hours"] == 36.0


def test_sla_by_week(client, db, seeded, auth_headers, admin_auth_headers):
    ok = make(client, auth_headers, seeded.id)
    late = make(client, auth_headers, seeded.id)
    age(db, ok, created_days_ago=3, resolved_days_ago=2)  # 24h: within 72h
    age(db, late, created_days_ago=10, resolved_days_ago=1)  # 9 days: breached
    rows = get(client, admin_auth_headers)["sla_by_week"]
    assert sum(r["total"] for r in rows) == 2 and sum(r["met"] for r in rows) == 1
    assert all(0 <= r["pct"] <= 100 for r in rows)
    assert all(datetime.fromisoformat(r["week_start"]).weekday() == 0 for r in rows)  # Mondays


def test_satisfaction_and_reopen_and_first_response(
    client, db, seeded, auth_headers, user2_headers, admin_auth_headers
):
    one = make(client, auth_headers, seeded.id)
    two = make(client, user2_headers, seeded.id)
    for tid, headers, rating in ((one, auth_headers, 5), (two, user2_headers, 3)):
        client.patch(
            f"{BASE}/tickets/{tid}", json={"status": "in_progress"}, headers=admin_auth_headers
        )
        client.patch(
            f"{BASE}/tickets/{tid}", json={"status": "resolved"}, headers=admin_auth_headers
        )
        client.post(f"{BASE}/tickets/{tid}/feedback", json={"rating": rating}, headers=headers)
    client.post(f"{BASE}/tickets/{one}/reopen", headers=auth_headers)
    a = get(client, admin_auth_headers)
    assert sum(w["count"] for w in a["satisfaction_by_week"]) == 2
    assert a["satisfaction_by_week"][0]["avg_rating"] == 4.0
    assert a["totals"]["reopen_rate_pct"] == 50.0
    assert a["totals"]["avg_first_response_hours"] is not None


# ---------- CSV ----------


def rows(client, headers, qs=""):
    r = client.get(f"{BASE}/reports/tickets.csv{qs}", headers=headers)
    assert r.status_code == 200, r.text
    return r, list(csv.DictReader(io.StringIO(r.text)))


def test_csv_content_and_headers(client, seeded, auth_headers, admin_auth_headers):
    tid = make(client, auth_headers, seeded.id, title="Printer, jammed")
    client.put(
        f"{BASE}/tickets/{tid}/assignee", json={"assignee_id": "tech-1"}, headers=admin_auth_headers
    )
    r, data = rows(client, admin_auth_headers)
    assert r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    row = data[0]
    assert row["id"] == str(tid) and row["title"] == "Printer, jammed"  # comma survives quoting
    assert (row["category"], row["status"], row["requester"], row["assignee"]) == (
        seeded.name,
        "open",
        "user-1",
        "tech-1",
    )
    assert row["sla_status"] == "ok" and row["satisfaction"] == ""


def test_csv_neutralises_formulas(client, seeded, auth_headers, admin_auth_headers):
    for title in ('=HYPERLINK("http://evil")', "+cmd|' /C calc'!A0", "-2+3", "@SUM(1)", "normal"):
        make(client, auth_headers, seeded.id, title=title)
    _, data = rows(client, admin_auth_headers)
    titles = [d["title"] for d in data]
    assert titles[:4] == ['\'=HYPERLINK("http://evil")', "'+cmd|' /C calc'!A0", "'-2+3", "'@SUM(1)"]
    assert titles[4] == "normal"


def test_csv_date_filter(client, db, seeded, auth_headers, admin_auth_headers):
    old = make(client, auth_headers, seeded.id)
    new = make(client, auth_headers, seeded.id)
    age(db, old, created_days_ago=20)
    _, only_new = rows(client, admin_auth_headers, f"?created_from={day(5)}")
    assert [r["id"] for r in only_new] == [str(new)]
    _, only_old = rows(client, admin_auth_headers, f"?created_to={day(10)}")
    assert [r["id"] for r in only_old] == [str(old)]
