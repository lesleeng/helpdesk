"""Duplicate-ticket detection by text overlap (local, no AI call)."""
from datetime import datetime, timedelta
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.models.ticket import Ticket, TicketStatus
from app.services.kb_service import terms

THRESHOLD = 0.35
WINDOW_DAYS = 30
ACTIVE = (TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD)


def _terms(ticket: Ticket) -> set:
    return set(terms(f"{ticket.title} {ticket.description}", limit=40))


def find_duplicates(db: Session, ticket: Ticket, limit: int = 5) -> List[Dict[str, Any]]:
    mine = _terms(ticket)
    if not mine:
        return []
    since = datetime.utcnow() - timedelta(days=WINDOW_DAYS)
    candidates = (
        db.query(Ticket)
        .filter(Ticket.id != ticket.id, Ticket.status.in_(ACTIVE), Ticket.created_at >= since)
        .all()
    )
    scored = []
    for other in candidates:
        theirs = _terms(other)
        union = mine | theirs
        score = len(mine & theirs) / len(union) if union else 0.0
        if score >= THRESHOLD:
            scored.append(
                {
                    "id": other.id,
                    "title": other.title,
                    "status": other.status.value,
                    "score": round(score, 2),
                }
            )
    scored.sort(key=lambda d: (-d["score"], d["id"]))
    return scored[:limit]
