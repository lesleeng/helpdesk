"""Manager approval for requests that need it (access, licences)."""
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.ticket import Ticket, TicketStatus
from app.services import directory
from app.services.ticket_core import is_admin, log_history


def request_approval(db: Session, ticket: Ticket) -> None:
    """Called while creating a ticket whose subcategory requires approval."""
    manager = directory.get_manager(ticket.user_id)
    ticket.approval_status = "pending"
    ticket.approver_id = manager["id"] if manager else None
    log_history(db, ticket.id, ticket.user_id, "approval", None, "pending", "approval_requested")


def decide(
    db: Session, ticket: Ticket, actor: Dict[str, Any], approve: bool, comment: Optional[str]
) -> Ticket:
    if ticket.approval_status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, "This ticket is not waiting for approval")
    if actor["id"] == ticket.user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot approve your own request")
    if not (is_admin(actor) or actor["id"] == ticket.approver_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the approver can decide")
    outcome = "approved" if approve else "rejected"
    ticket.approval_status = outcome
    ticket.approval_decided_by_id = actor["id"]
    ticket.approval_decided_at = datetime.utcnow()
    ticket.approval_comment = comment
    log_history(db, ticket.id, actor["id"], "approval", "pending", outcome, f"approval_{outcome}")
    if not approve and ticket.status not in (TicketStatus.CLOSED, TicketStatus.CANCELLED):
        log_history(
            db,
            ticket.id,
            actor["id"],
            "status",
            ticket.status,
            TicketStatus.CANCELLED,
            "status_change",
        )
        ticket.status = TicketStatus.CANCELLED
    db.commit()
    db.refresh(ticket)
    return ticket


def list_pending(db: Session, actor: Dict[str, Any]) -> List[Ticket]:
    q = db.query(Ticket).filter(Ticket.approval_status == "pending")
    if not is_admin(actor):
        q = q.filter(Ticket.approver_id == actor["id"])
    return q.order_by(Ticket.created_at, Ticket.id).all()


def count_pending(db: Session) -> int:
    return db.query(Ticket).filter(Ticket.approval_status == "pending").count()
