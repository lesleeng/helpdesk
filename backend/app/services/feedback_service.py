"""Post-resolution satisfaction survey."""
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.feedback import TicketFeedback
from app.models.ticket import Ticket, TicketStatus
from app.services.ticket_core import log_history


def submit(
    db: Session, ticket: Ticket, user: Dict[str, Any], rating: int, comment: Optional[str]
) -> TicketFeedback:
    if ticket.user_id != user["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the submitter can rate a ticket")
    if ticket.status not in (TicketStatus.RESOLVED, TicketStatus.CLOSED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Only resolved tickets can be rated")
    if ticket.feedback is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This ticket was already rated")
    fb = TicketFeedback(ticket_id=ticket.id, user_id=user["id"], rating=rating, comment=comment)
    db.add(fb)
    log_history(db, ticket.id, user["id"], "feedback", None, rating, "feedback_submitted")
    db.commit()
    db.refresh(fb)
    return fb


def stats(db: Session) -> Dict[str, Any]:
    ratings = [r for (r,) in db.query(TicketFeedback.rating).all()]
    return {
        "feedback_count": len(ratings),
        "avg_satisfaction": round(sum(ratings) / len(ratings), 2) if ratings else None,
    }
