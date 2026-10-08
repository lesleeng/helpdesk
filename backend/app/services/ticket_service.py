"""Ticket business logic: access control, status flow, audit trail."""
import os
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models.category import TicketCategory, TicketExtraFields, TicketSubcategory
from app.models.ticket import (
    Ticket,
    TicketAttachment,
    TicketComment,
    TicketPriority,
    TicketStatus,
)
from app.schemas.ticket import BulkRequest, CommentCreate, TicketCreate
from app.services import approval_service, directory, feedback_service, form_service, sla_service
from app.services.ticket_core import is_admin
from app.services.ticket_core import log_history as _log

S = TicketStatus

ADMIN_TRANSITIONS = {
    S.OPEN: {S.IN_PROGRESS, S.CANCELLED},
    S.IN_PROGRESS: {S.ON_HOLD, S.RESOLVED, S.CANCELLED},
    S.ON_HOLD: {S.IN_PROGRESS, S.CANCELLED},
    S.RESOLVED: {S.CLOSED, S.CANCELLED},
    S.CLOSED: set(),
    S.CANCELLED: set(),
}


def is_staff(user: Dict[str, Any]) -> bool:
    return user.get("role") in ("admin", "tech")


def can_manage(ticket: Ticket, user: Dict[str, Any]) -> bool:
    """Admins manage every ticket; tech staff manage only tickets assigned to them."""
    return is_admin(user) or (user.get("role") == "tech" and ticket.assigned_to_id == user["id"])


def get_ticket_for_user(db: Session, ticket_id: int, user: Dict[str, Any]) -> Ticket:
    """Fetch a ticket the user may view: own tickets, plus assigned ones for tech staff, all for
    admins. 404 otherwise, to avoid leaking IDs."""
    ticket = db.get(Ticket, ticket_id)
    if ticket is None or not (
        ticket.user_id == user["id"] or ticket.approver_id == user["id"] or can_manage(ticket, user)
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return ticket


def get_ticket_for_staff(db: Session, ticket_id: int, user: Dict[str, Any]) -> Ticket:
    """Fetch a ticket the user may work on as staff (admin: any; tech: assigned only)."""
    ticket = db.get(Ticket, ticket_id)
    if ticket is None or not can_manage(ticket, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return ticket


def create_ticket(db: Session, data: TicketCreate, user: Dict[str, Any]) -> Ticket:
    if db.get(TicketCategory, data.category_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown category")
    sub = None
    if data.subcategory_id is not None:
        sub = db.get(TicketSubcategory, data.subcategory_id)
        if sub is None or sub.category_id != data.category_id:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Subcategory does not belong to category"
            )

    if sub is not None and not sub.active:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "This request type is no longer available"
        )
    extra_fields = form_service.validate_extra_fields(sub, data.extra_fields)
    now = datetime.utcnow()
    response_hours, resolution_hours = sla_service.sla_hours(db, data.category_id)
    ticket = Ticket(
        created_at=now,
        sla_response_due=now + timedelta(hours=response_hours),
        sla_resolution_due=now + timedelta(hours=resolution_hours),
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
    for name, value in extra_fields.items():
        db.add(
            TicketExtraFields(
                ticket_id=ticket.id,
                subcategory_id=data.subcategory_id,
                field_name=name,
                field_value=value,
            )
        )
    _log(db, ticket.id, user["id"], "status", None, TicketStatus.OPEN, "created")
    if data.subcategory_id is not None and sub.requires_approval:
        approval_service.request_approval(db, ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@dataclass
class TicketFilters:
    status: Optional[TicketStatus] = None
    category_id: Optional[int] = None
    priority: Optional[TicketPriority] = None
    search: Optional[str] = None
    mine: bool = False
    assignee_id: Optional[str] = None
    unassigned: bool = False
    created_from: Optional[date] = None
    created_to: Optional[date] = None
    sla_breached: bool = False


def list_tickets(
    db: Session, user: Dict[str, Any], f: TicketFilters, page: int, page_size: int
) -> Tuple[List[Ticket], int]:
    q = db.query(Ticket)
    if f.mine or not is_staff(user):
        q = q.filter(Ticket.user_id == user["id"])
    elif not is_admin(user):
        q = q.filter(or_(Ticket.user_id == user["id"], Ticket.assigned_to_id == user["id"]))
    if f.status:
        q = q.filter(Ticket.status == f.status)
    if f.category_id:
        q = q.filter(Ticket.category_id == f.category_id)
    if f.priority:
        q = q.filter(Ticket.priority == f.priority)
    if f.assignee_id:
        q = q.filter(Ticket.assigned_to_id == f.assignee_id)
    if f.unassigned:
        q = q.filter(Ticket.assigned_to_id.is_(None))
    if f.created_from:
        q = q.filter(Ticket.created_at >= datetime.combine(f.created_from, time.min))
    if f.created_to:
        q = q.filter(Ticket.created_at <= datetime.combine(f.created_to, time.max))
    if f.sla_breached:
        now = datetime.utcnow()
        active = [TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD]
        q = q.filter(
            Ticket.status.in_(active),
            or_(
                Ticket.sla_resolution_due < now,
                and_(Ticket.first_response_at.is_(None), Ticket.sla_response_due < now),
            ),
        )
    if f.search:
        like = f"%{f.search}%"
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
        if ticket.approval_status == "pending" and new_status != TicketStatus.CANCELLED:
            raise HTTPException(status.HTTP_409_CONFLICT, "Waiting for manager approval")
        _log(db, ticket.id, admin["id"], "status", ticket.status, new_status, "status_change")
        now = datetime.utcnow()
        if ticket.first_response_at is None and ticket.user_id != admin["id"]:
            ticket.first_response_at = now
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
    if data.is_internal and not can_manage(ticket, user):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only assigned staff can post internal notes"
        )
    comment = TicketComment(
        ticket_id=ticket.id,
        user_id=user["id"],
        content=data.content,
        is_internal=data.is_internal,
    )
    db.add(comment)
    if (
        not data.is_internal
        and ticket.first_response_at is None
        and can_manage(ticket, user)
        and ticket.user_id != user["id"]
    ):
        ticket.first_response_at = datetime.utcnow()
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
    if not can_manage(ticket, user):
        q = q.filter(TicketComment.is_internal.is_(False))
    return q.order_by(TicketComment.created_at, TicketComment.id).all()


def assign_ticket(
    db: Session, ticket: Ticket, admin: Dict[str, Any], assignee_id: Optional[str]
) -> Ticket:
    if assignee_id is not None:
        if assignee_id not in {u["id"] for u in directory.list_staff()}:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown staff member")
    if assignee_id != ticket.assigned_to_id:
        _log(db, ticket.id, admin["id"], "assignee", ticket.assigned_to_id, assignee_id, "assigned")
        ticket.assigned_to_id = assignee_id
        ticket.assigned_at = datetime.utcnow() if assignee_id else None
    db.commit()
    db.refresh(ticket)
    return ticket


def bulk_update(db: Session, admin: Dict[str, Any], req: BulkRequest) -> Dict[str, Any]:
    """Apply status/priority/assignee to many tickets; one failure never blocks the others."""
    updated: List[int] = []
    failed: List[Dict[str, Any]] = []
    for ticket_id in dict.fromkeys(req.ticket_ids):
        try:
            ticket = get_ticket_for_staff(db, ticket_id, admin)
            if req.assignee_id is not None:
                assign_ticket(db, ticket, admin, req.assignee_id)
            if req.status is not None or req.priority is not None:
                update_ticket(db, ticket, admin, req.status, req.priority)
            updated.append(ticket_id)
        except HTTPException as exc:
            db.rollback()
            failed.append({"id": ticket_id, "reason": str(exc.detail)})
    return {"updated": updated, "failed": failed}


def report_stats(db: Session) -> Dict[str, Any]:
    tickets = db.query(Ticket).all()
    done_states = (TicketStatus.RESOLVED, TicketStatus.CLOSED)
    active = (TicketStatus.OPEN, TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD)
    resolved = [t for t in tickets if t.status in done_states]
    open_ = [t for t in tickets if t.status in active]

    def avg_hours(pairs):
        vals = [(b - a).total_seconds() / 3600 for a, b in pairs]
        return round(sum(vals) / len(vals), 2) if vals else None

    def pct(met: int, total: int):
        return round(100 * met / total, 1) if total else None

    responded = [t for t in tickets if t.first_response_at and t.sla_response_due]
    finished = [t for t in resolved if (t.resolved_at or t.closed_at) and t.sla_resolution_due]
    load: Dict[str, Dict[str, int]] = {}
    for t in tickets:
        if t.assigned_to_id and t.status in active + done_states:
            row = load.setdefault(t.assigned_to_id, {"open": 0, "resolved": 0})
            row["open" if t.status in active else "resolved"] += 1
    return {
        "open_count": len(open_),
        "resolved_count": len(resolved),
        "avg_resolution_hours": avg_hours(
            (t.created_at, t.resolved_at or t.closed_at)
            for t in resolved
            if t.resolved_at or t.closed_at
        ),
        "avg_first_response_hours": avg_hours(
            (t.created_at, t.first_response_at) for t in responded
        ),
        "response_sla_met_pct": pct(
            sum(1 for t in responded if t.first_response_at <= t.sla_response_due), len(responded)
        ),
        "resolution_sla_met_pct": pct(
            sum(1 for t in finished if (t.resolved_at or t.closed_at) <= t.sla_resolution_due),
            len(finished),
        ),
        "unassigned_open": sum(1 for t in open_ if t.assigned_to_id is None),
        "pending_approval": approval_service.count_pending(db),
        **feedback_service.stats(db),
        "by_assignee": [
            {"assignee_id": k, **v} for k, v in sorted(load.items(), key=lambda kv: kv[0])
        ],
    }


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
