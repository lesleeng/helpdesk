"""Ticket business logic: access control, status flow, audit trail."""
import os
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models.category import TicketCategory, TicketExtraFields, TicketSubcategory
from app.models.ticket import (
    Ticket,
    TicketAttachment,
    TicketComment,
    TicketHistory,
    TicketPriority,
    TicketStatus,
)
from app.schemas.ticket import CommentCreate, TicketCreate

S = TicketStatus

ADMIN_TRANSITIONS = {
    S.OPEN: {S.IN_PROGRESS, S.CANCELLED},
    S.IN_PROGRESS: {S.ON_HOLD, S.RESOLVED, S.CANCELLED},
    S.ON_HOLD: {S.IN_PROGRESS, S.CANCELLED},
    S.RESOLVED: {S.CLOSED, S.CANCELLED},
    S.CLOSED: set(),
    S.CANCELLED: set(),
}


def is_admin(user: Dict[str, Any]) -> bool:
    return user.get("role") == "admin"


def _log(db: Session, ticket_id: int, user_id: str, field: str, old: Any, new: Any, kind: str):
    db.add(
        TicketHistory(
            ticket_id=ticket_id,
            changed_by_id=user_id,
            field_name=field,
            old_value=None if old is None else str(getattr(old, "value", old)),
            new_value=None if new is None else str(getattr(new, "value", new)),
            change_type=kind,
        )
    )


def get_ticket_for_user(db: Session, ticket_id: int, user: Dict[str, Any]) -> Ticket:
    """Fetch a ticket; non-admins only see their own (404 otherwise, to avoid leaking IDs)."""
    ticket = db.get(Ticket, ticket_id)
    if ticket is None or (not is_admin(user) and ticket.user_id != user["id"]):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return ticket


def create_ticket(db: Session, data: TicketCreate, user: Dict[str, Any]) -> Ticket:
    if db.get(TicketCategory, data.category_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown category")
    if data.subcategory_id is not None:
        sub = db.get(TicketSubcategory, data.subcategory_id)
        if sub is None or sub.category_id != data.category_id:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Subcategory does not belong to category"
            )

    ticket = Ticket(
        title=data.title,
        description=data.description,
        user_id=user["id"],
        category_id=data.category_id,
        subcategory_id=data.subcategory_id,
        urgency=data.urgency,
        status=TicketStatus.OPEN,
    )
    db.add(ticket)
    db.flush()
    for name, value in data.extra_fields.items():
        db.add(
            TicketExtraFields(
                ticket_id=ticket.id,
                subcategory_id=data.subcategory_id,
                field_name=name,
                field_value=value,
            )
        )
    _log(db, ticket.id, user["id"], "status", None, TicketStatus.OPEN, "created")
    db.commit()
    db.refresh(ticket)
    return ticket


def list_tickets(
    db: Session,
    user: Dict[str, Any],
    status_filter: Optional[TicketStatus],
    category_id: Optional[int],
    search: Optional[str],
    page: int,
    page_size: int,
    mine: bool = False,
) -> Tuple[List[Ticket], int]:
    q = db.query(Ticket)
    if mine or not is_admin(user):
        q = q.filter(Ticket.user_id == user["id"])
    if status_filter:
        q = q.filter(Ticket.status == status_filter)
    if category_id:
        q = q.filter(Ticket.category_id == category_id)
    if search:
        like = f"%{search}%"
        q = q.filter(or_(Ticket.title.ilike(like), Ticket.description.ilike(like)))
    total = q.count()
    items = (
        q.order_by(Ticket.created_at.desc(), Ticket.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return items, total


def update_ticket(
    db: Session,
    ticket: Ticket,
    admin: Dict[str, Any],
    new_status: Optional[TicketStatus],
    new_priority: Optional[TicketPriority],
) -> Ticket:
    if new_status is not None and new_status != ticket.status:
        if new_status not in ADMIN_TRANSITIONS[ticket.status]:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Cannot move ticket from {ticket.status.value} to {new_status.value}",
            )
        _log(db, ticket.id, admin["id"], "status", ticket.status, new_status, "status_change")
        now = datetime.utcnow()
        if new_status == TicketStatus.RESOLVED:
            ticket.resolved_at = now
        elif new_status == TicketStatus.CLOSED:
            ticket.closed_at = now
        ticket.status = new_status
    if new_priority is not None and new_priority != ticket.priority:
        _log(
            db, ticket.id, admin["id"], "priority", ticket.priority, new_priority, "priority_change"
        )
        ticket.priority = new_priority
    db.commit()
    db.refresh(ticket)
    return ticket


def reopen_ticket(db: Session, ticket: Ticket, user: Dict[str, Any]) -> Ticket:
    if ticket.status != TicketStatus.RESOLVED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only resolved tickets can be reopened")
    window = timedelta(days=settings.REOPEN_WINDOW_DAYS)
    if ticket.resolved_at is None or datetime.utcnow() - ticket.resolved_at > window:
        raise HTTPException(status.HTTP_409_CONFLICT, "Reopen window has expired")
    _log(db, ticket.id, user["id"], "status", ticket.status, TicketStatus.OPEN, "reopened")
    ticket.status = TicketStatus.OPEN
    ticket.resolved_at = None
    ticket.reopen_count += 1
    ticket.last_reopened_at = datetime.utcnow()
    db.commit()
    db.refresh(ticket)
    return ticket


def add_comment(
    db: Session, ticket: Ticket, data: CommentCreate, user: Dict[str, Any]
) -> TicketComment:
    if data.is_internal and not is_admin(user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can post internal notes")
    comment = TicketComment(
        ticket_id=ticket.id,
        user_id=user["id"],
        content=data.content,
        is_internal=data.is_internal,
    )
    db.add(comment)
    _log(
        db,
        ticket.id,
        user["id"],
        "comment",
        None,
        "internal" if data.is_internal else "public",
        "comment_added",
    )
    db.commit()
    db.refresh(comment)
    return comment


def list_comments(db: Session, ticket: Ticket, user: Dict[str, Any]) -> List[TicketComment]:
    q = db.query(TicketComment).filter(TicketComment.ticket_id == ticket.id)
    if not is_admin(user):
        q = q.filter(TicketComment.is_internal.is_(False))
    return q.order_by(TicketComment.created_at, TicketComment.id).all()


async def save_attachment(
    db: Session, ticket: Ticket, upload: UploadFile, user: Dict[str, Any]
) -> TicketAttachment:
    original = os.path.basename(upload.filename or "")
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    allowed = {e.strip().lower() for e in settings.ALLOWED_FILE_TYPES.split(",")}
    if ext not in allowed:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"File type '.{ext}' not allowed")

    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content = await upload.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds {settings.MAX_UPLOAD_SIZE_MB}MB limit",
        )

    rel_dir = str(ticket.id)
    os.makedirs(os.path.join(settings.UPLOAD_DIR, rel_dir), exist_ok=True)
    rel_path = os.path.join(rel_dir, f"{uuid.uuid4().hex}.{ext}")
    with open(os.path.join(settings.UPLOAD_DIR, rel_path), "wb") as fh:
        fh.write(content)

    attachment = TicketAttachment(
        ticket_id=ticket.id,
        file_name=original,
        file_path=rel_path,
        file_size=len(content),
        file_type=upload.content_type,
        uploaded_by_id=user["id"],
    )
    db.add(attachment)
    _log(db, ticket.id, user["id"], "attachment", None, original, "attachment_added")
    db.commit()
    db.refresh(attachment)
    return attachment


def dashboard_stats(db: Session) -> Dict[str, Any]:
    tickets = db.query(Ticket).all()
    categories = {c.id: c.name for c in db.query(TicketCategory).all()}
    by_status: Dict[str, int] = {}
    by_category: Dict[str, int] = {}
    by_priority: Dict[str, int] = {}
    durations = []
    for t in tickets:
        by_status[t.status.value] = by_status.get(t.status.value, 0) + 1
        cat = categories.get(t.category_id, str(t.category_id))
        by_category[cat] = by_category.get(cat, 0) + 1
        by_priority[t.priority.value] = by_priority.get(t.priority.value, 0) + 1
        if t.resolved_at:
            durations.append((t.resolved_at - t.created_at).total_seconds() / 3600)
    avg = round(sum(durations) / len(durations), 2) if durations else None
    return {
        "total": len(tickets),
        "by_status": by_status,
        "by_category": by_category,
        "by_priority": by_priority,
        "avg_resolution_hours": avg,
    }
