"""Email notifications. No-ops unless ENABLE_EMAIL_NOTIFICATIONS=true; never raises into a request."""
import logging
import smtplib
from email.message import EmailMessage
from typing import Any, Dict, Iterable, Optional

from fastapi import BackgroundTasks, HTTPException

from app.config import settings
from app.models.ticket import Ticket
from app.services import directory

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM_ADDRESS
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.SMTP_SERVER, settings.SMTP_PORT, timeout=10) as smtp:
            if settings.SMTP_STARTTLS:
                smtp.starttls()
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            smtp.send_message(msg)
    except (OSError, smtplib.SMTPException):
        logger.exception("Failed to send email to %s", to)


def _link(ticket: Ticket) -> str:
    return f"{settings.APP_BASE_URL}/tickets/{ticket.id}"


def _queue(
    bg: BackgroundTasks,
    user_ids: Iterable[Optional[str]],
    subject: str,
    body: str,
    exclude: Optional[str] = None,
) -> None:
    if not settings.ENABLE_EMAIL_NOTIFICATIONS:
        return
    for uid in dict.fromkeys(u for u in user_ids if u and u != exclude):
        user = directory.get_user(uid)
        if user and user.get("email"):
            bg.add_task(send_email, user["email"], subject, body)


def _admin_ids() -> list:
    try:
        return [u["id"] for u in directory.list_staff() if u["role"] == "admin"]
    except HTTPException:
        return []


def ticket_created(bg: BackgroundTasks, ticket: Ticket) -> None:
    subject = f"[Help Desk] Ticket #{ticket.id} received: {ticket.title}"
    body = f"Ticket #{ticket.id} was submitted.\n{_link(ticket)}"
    _queue(bg, [ticket.user_id, *_admin_ids()], subject, body)


def status_changed(bg: BackgroundTasks, ticket: Ticket, actor: Dict[str, Any], old: str) -> None:
    subject = f"[Help Desk] Ticket #{ticket.id} is now {ticket.status.value}"
    body = f"Status changed from {old} to {ticket.status.value}.\n{_link(ticket)}"
    _queue(bg, [ticket.user_id, ticket.assigned_to_id], subject, body, exclude=actor["id"])


def comment_added(bg: BackgroundTasks, ticket: Ticket, actor: Dict[str, Any], internal: bool):
    subject = f"[Help Desk] New comment on ticket #{ticket.id}"
    body = f"A new comment was added.\n{_link(ticket)}"
    recipients = [ticket.assigned_to_id] if internal else [ticket.user_id, ticket.assigned_to_id]
    _queue(bg, recipients, subject, body, exclude=actor["id"])


def assigned(bg: BackgroundTasks, ticket: Ticket, actor: Dict[str, Any]) -> None:
    subject = f"[Help Desk] Ticket #{ticket.id} assigned to you"
    body = f"{ticket.title}\n{_link(ticket)}"
    _queue(bg, [ticket.assigned_to_id], subject, body, exclude=actor["id"])
