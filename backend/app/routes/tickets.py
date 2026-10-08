"""Ticket, comment, history, assignment, bulk and attachment endpoints."""
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user, require_admin, require_staff
from app.models.ticket import TicketHistory, TicketPriority, TicketStatus
from app.schemas.ticket import (
    AssignRequest,
    AttachmentOut,
    BulkRequest,
    BulkResult,
    CommentCreate,
    CommentOut,
    HistoryOut,
    TicketCreate,
    TicketDetailOut,
    TicketListOut,
    TicketOut,
    TicketUpdate,
)
from app.services import notification_service as notify
from app.services import ticket_service as svc

router = APIRouter(prefix="/api/helpdesk/tickets", tags=["tickets"])


@router.get("", response_model=TicketListOut)
def list_tickets(
    status_filter: Optional[TicketStatus] = Query(None, alias="status"),
    category_id: Optional[int] = None,
    priority: Optional[TicketPriority] = None,
    search: Optional[str] = None,
    mine: bool = False,
    assignee_id: Optional[str] = None,
    unassigned: bool = False,
    created_from: Optional[date] = None,
    created_to: Optional[date] = None,
    sla_breached: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    filters = svc.TicketFilters(
        status=status_filter,
        category_id=category_id,
        priority=priority,
        search=search,
        mine=mine,
        assignee_id=assignee_id,
        unassigned=unassigned,
        created_from=created_from,
        created_to=created_to,
        sla_breached=sla_breached,
    )
    items, total = svc.list_tickets(db, user, filters, page, page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("", response_model=TicketDetailOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    data: TicketCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    ticket = svc.create_ticket(db, data, user)
    notify.ticket_created(background, ticket)
    if ticket.approval_status == "pending":
        notify.approval_requested(background, ticket)
    return ticket


@router.post("/bulk", response_model=BulkResult)
def bulk_update(
    data: BulkRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: Dict[str, Any] = Depends(require_admin),
):
    result = svc.bulk_update(db, admin, data)
    for ticket_id in result["updated"]:
        ticket = svc.get_ticket_for_staff(db, ticket_id, admin)
        if data.assignee_id is not None:
            notify.assigned(background, ticket, admin)
    return result


@router.get("/{ticket_id}", response_model=TicketDetailOut)
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    return svc.get_ticket_for_user(db, ticket_id, user)


@router.patch("/{ticket_id}", response_model=TicketOut)
def update_ticket(
    ticket_id: int,
    data: TicketUpdate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    staff: Dict[str, Any] = Depends(require_staff),
):
    ticket = svc.get_ticket_for_staff(db, ticket_id, staff)
    old_status = ticket.status.value
    ticket = svc.update_ticket(db, ticket, staff, data.status, data.priority)
    if ticket.status.value != old_status:
        notify.status_changed(background, ticket, staff, old_status)
    return ticket


@router.put("/{ticket_id}/assignee", response_model=TicketOut)
def assign_ticket(
    ticket_id: int,
    data: AssignRequest,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: Dict[str, Any] = Depends(require_admin),
):
    ticket = svc.get_ticket_for_staff(db, ticket_id, admin)
    ticket = svc.assign_ticket(db, ticket, admin, data.assignee_id)
    notify.assigned(background, ticket, admin)
    return ticket


@router.post("/{ticket_id}/reopen", response_model=TicketOut)
def reopen_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    ticket = svc.get_ticket_for_user(db, ticket_id, user)
    return svc.reopen_ticket(db, ticket, user)


@router.get("/{ticket_id}/comments", response_model=List[CommentOut])
def list_comments(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    ticket = svc.get_ticket_for_user(db, ticket_id, user)
    return svc.list_comments(db, ticket, user)


@router.post(
    "/{ticket_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED
)
def add_comment(
    ticket_id: int,
    data: CommentCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    ticket = svc.get_ticket_for_user(db, ticket_id, user)
    comment = svc.add_comment(db, ticket, data, user)
    notify.comment_added(background, ticket, user, comment.is_internal)
    return comment


@router.get("/{ticket_id}/history", response_model=List[HistoryOut])
def get_history(
    ticket_id: int,
    db: Session = Depends(get_db),
    staff: Dict[str, Any] = Depends(require_staff),
):
    ticket = svc.get_ticket_for_staff(db, ticket_id, staff)
    return (
        db.query(TicketHistory)
        .filter(TicketHistory.ticket_id == ticket.id)
        .order_by(TicketHistory.created_at, TicketHistory.id)
        .all()
    )


@router.post(
    "/{ticket_id}/attachments", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED
)
async def upload_attachment(
    ticket_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    ticket = svc.get_ticket_for_user(db, ticket_id, user)
    return await svc.save_attachment(db, ticket, file, user)
