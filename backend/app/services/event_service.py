"""One place that turns a ticket change into outbound events (webhooks and Slack)."""
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.models.ticket import Ticket
from app.services import slack_service, webhook_service


def ticket_summary(ticket: Ticket) -> Dict[str, Any]:
    return {
        "id": ticket.id,
        "title": ticket.title,
        "status": ticket.status.value,
        "priority": ticket.priority.value,
        "urgency": ticket.urgency.value,
        "category_id": ticket.category_id,
        "subcategory_id": ticket.subcategory_id,
        "requester_id": ticket.user_id,
        "assigned_to_id": ticket.assigned_to_id,
        "approval_status": ticket.approval_status,
        "sla_status": ticket.sla_status,
        "created_at": ticket.created_at.isoformat() + "Z",
    }


def emit(
    db: Session,
    bg: BackgroundTasks,
    event: str,
    ticket: Ticket,
    actor: Optional[Dict[str, Any]] = None,
    data: Optional[Dict[str, Any]] = None,
) -> None:
    data = data or {}
    payload = {
        "id": str(uuid.uuid4()),
        "event": event,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "ticket": ticket_summary(ticket),
        "actor": {"id": actor["id"], "name": actor.get("name")} if actor else None,
        "data": data,
    }
    webhook_service.dispatch(db, bg, event, payload)
    slack_service.dispatch(bg, event, ticket, actor, data)
