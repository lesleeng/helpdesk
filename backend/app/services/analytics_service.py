"""Trend analytics and CSV export for admins."""
import csv
import io
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.category import TicketCategory, TicketSubcategory
from app.models.ticket import Ticket, TicketStatus

ACTIVE = (TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD)
BACKLOG_BUCKETS = [
    ("Under 1 day", 0, 1),
    ("1-3 days", 1, 3),
    ("3-7 days", 3, 7),
    ("Over 7 days", 7, None),
]


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _hours(a: datetime, b: datetime) -> float:
    return (b - a).total_seconds() / 3600


def _avg(values: List[float]) -> Optional[float]:
    return round(sum(values) / len(values), 2) if values else None


def analytics(db: Session, days: int) -> Dict[str, Any]:
    now = datetime.utcnow()
    today = now.date()
    first_day = today - timedelta(days=days - 1)
    start = datetime.combine(first_day, time.min)
    tickets = db.query(Ticket).all()
    categories = {c.id: c.name for c in db.query(TicketCategory).all()}

    created = defaultdict(int)
    resolved = defaultdict(int)
    for t in tickets:
        if t.created_at >= start:
            created[t.created_at.date()] += 1
        if t.resolved_at and t.resolved_at >= start:
            resolved[t.resolved_at.date()] += 1
    volume = [
        {
            "date": (first_day + timedelta(days=i)).isoformat(),
            "created": created[first_day + timedelta(days=i)],
            "resolved": resolved[first_day + timedelta(days=i)],
        }
        for i in range(days)
    ]

    backlog = []
    active = [t for t in tickets if t.status in ACTIVE]
    for label, low, high in BACKLOG_BUCKETS:
        count = sum(
            1
            for t in active
            if (now - t.created_at) >= timedelta(days=low)
            and (high is None or (now - t.created_at) < timedelta(days=high))
        )
        backlog.append({"bucket": label, "count": count})

    in_range = [t for t in tickets if t.created_at >= start]
    done = [t for t in tickets if t.resolved_at and t.resolved_at >= start]

    by_cat: Dict[str, List[float]] = defaultdict(list)
    for t in done:
        by_cat[categories.get(t.category_id, str(t.category_id))].append(
            _hours(t.created_at, t.resolved_at)
        )
    resolution_by_category = [
        {"category": name, "avg_hours": _avg(vals), "resolved": len(vals)}
        for name, vals in sorted(by_cat.items())
    ]

    sla_weeks: Dict[date, List[int]] = defaultdict(lambda: [0, 0])
    for t in done:
        row = sla_weeks[_week_start(t.resolved_at.date())]
        row[1] += 1
        row[0] += 1 if t.sla_state(now) == "met" else 0
    sla_by_week = [
        {
            "week_start": w.isoformat(),
            "met": met,
            "total": total,
            "pct": round(100 * met / total, 1),
        }
        for w, (met, total) in sorted(sla_weeks.items())
    ]

    ratings: Dict[date, List[int]] = defaultdict(list)
    for t in tickets:
        if t.feedback is not None and t.feedback.created_at >= start:
            ratings[_week_start(t.feedback.created_at.date())].append(t.feedback.rating)
    satisfaction_by_week = [
        {
            "week_start": w.isoformat(),
            "avg_rating": _avg([float(r) for r in vals]),
            "count": len(vals),
        }
        for w, vals in sorted(ratings.items())
    ]

    responded = [t for t in in_range if t.first_response_at]
    reopened = sum(1 for t in in_range if t.reopen_count > 0)
    return {
        "days": days,
        "totals": {
            "created": len(in_range),
            "resolved": len(done),
            "avg_first_response_hours": _avg(
                [_hours(t.created_at, t.first_response_at) for t in responded]
            ),
            "avg_resolution_hours": _avg([_hours(t.created_at, t.resolved_at) for t in done]),
            "reopen_rate_pct": round(100 * reopened / len(in_range), 1) if in_range else None,
        },
        "volume": volume,
        "backlog_age": backlog,
        "resolution_by_category": resolution_by_category,
        "sla_by_week": sla_by_week,
        "satisfaction_by_week": satisfaction_by_week,
    }


def _safe(value: Any) -> str:
    """Neutralise spreadsheet formulas in exported text."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def export_csv(
    db: Session, created_from: Optional[date], created_to: Optional[date], limit: int = 50000
) -> str:
    q = db.query(Ticket)
    if created_from:
        q = q.filter(Ticket.created_at >= datetime.combine(created_from, time.min))
    if created_to:
        q = q.filter(Ticket.created_at <= datetime.combine(created_to, time.max))
    categories = {c.id: c.name for c in db.query(TicketCategory).all()}
    subs = {s.id: s.name for s in db.query(TicketSubcategory).all()}
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(
        [
            "id",
            "title",
            "category",
            "request_type",
            "status",
            "priority",
            "urgency",
            "requester",
            "assignee",
            "created_at",
            "first_response_at",
            "resolved_at",
            "closed_at",
            "sla_status",
            "approval_status",
            "satisfaction",
        ]
    )
    for t in q.order_by(Ticket.id).limit(limit).all():
        writer.writerow(
            [
                t.id,
                _safe(t.title),
                _safe(categories.get(t.category_id)),
                _safe(subs.get(t.subcategory_id)),
                t.status.value,
                t.priority.value,
                t.urgency.value,
                _safe(t.user_id),
                _safe(t.assigned_to_id),
                t.created_at.isoformat(),
                t.first_response_at.isoformat() if t.first_response_at else "",
                t.resolved_at.isoformat() if t.resolved_at else "",
                t.closed_at.isoformat() if t.closed_at else "",
                t.sla_state(),
                t.approval_status or "",
                t.feedback.rating if t.feedback else "",
            ]
        )
    return out.getvalue()
