"""Slack notifications through an incoming-webhook URL (admin-configured in the environment)."""
import logging
from typing import Any, Dict, Optional

import httpx
from fastapi import BackgroundTasks

from app.config import settings
from app.models.ticket import Ticket

logger = logging.getLogger(__name__)

SLACK_EVENTS = {
    "ticket.created": "New ticket",
    "ticket.assigned": "Ticket assigned",
    "ticket.status_changed": "Status changed",
    "ticket.approval_requested": "Approval needed",
    "ticket.approval_decided": "Approval decision",
    "ticket.feedback_submitted": "Feedback received",
}


def is_enabled() -> bool:
    return bool(settings.ENABLE_SLACK_NOTIFICATIONS and settings.SLACK_WEBHOOK_URL)


def _esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def format_message(
    event: str, ticket: Ticket, actor: Optional[Dict[str, Any]], data: Dict[str, Any]
) -> Optional[str]:
    label = SLACK_EVENTS.get(event)
    if label is None:
        return None
    link = f"{settings.APP_BASE_URL}/tickets/{ticket.id}"
    parts = [f"*{label}:* <{link}|#{ticket.id} {_esc(ticket.title)}>"]
    if event == "ticket.status_changed":
        parts.append(f"{data.get('from', '?')} → {ticket.status.value}")
    elif event == "ticket.assigned":
        parts.append(f"assigned to {_esc(str(ticket.assigned_to_id or 'nobody'))}")
    elif event == "ticket.approval_decided":
        parts.append(_esc(str(ticket.approval_status)))
    elif event == "ticket.feedback_submitted":
        parts.append(f"{data.get('rating', '?')}/5")
    parts.append(f"priority {ticket.priority.value}")
    if actor and actor.get("name"):
        parts.append(f"by {_esc(actor['name'])}")
    return " · ".join(parts)


def post(text: str) -> None:
    try:
        httpx.post(settings.SLACK_WEBHOOK_URL, json={"text": text}, timeout=5.0)
    except httpx.HTTPError:
        logger.exception("Slack notification failed")


def dispatch(
    bg: BackgroundTasks,
    event: str,
    ticket: Ticket,
    actor: Optional[Dict[str, Any]],
    data: Dict[str, Any],
) -> None:
    if not is_enabled():
        return
    text = format_message(event, ticket, actor, data)
    if text:
        bg.add_task(post, text)
