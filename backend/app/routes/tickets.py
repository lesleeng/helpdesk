"""Ticket, comment, history and attachment endpoints."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user, require_admin
from app.models.ticket import TicketHistory, TicketStatus
from app.schemas.ticket import (
    AttachmentOut,
    CommentCreate,
    CommentOut,
    HistoryOut,
    TicketCreate,
    TicketDetailOut,
    TicketListOut,
    TicketOut,
    TicketUpdate,
)
from app.services import ticket_service as svc

router = APIRouter(prefix="/api/helpdesk/tickets", tags=["tickets"])


@router.get("", response_model=TicketListOut)
def list_tickets(
    status_filter: Optional[TicketStatus] = Query(None, alias="status"),
    category_id: Optional[int] = None,
    search: Optional[str] = None,
    mine: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    items, total = svc.list_tickets(
        db, user, status_filter, category_id, search, page, page_size, mine
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("", response_model=TicketDetailOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    data: TicketCreate,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    return svc.create_ticket(db, data, user)


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
    db: Session = Depends(get_db),
    admin: Dict[str, Any] = Depends(require_admin),
):
    ticket = svc.get_ticket_for_user(db, ticket_id, admin)
    return svc.update_ticket(db, ticket, admin, data.status, data.priority)


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
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    ticket = svc.get_ticket_for_user(db, ticket_id, user)
    return svc.add_comment(db, ticket, data, user)


@router.get("/{ticket_id}/history", response_model=List[HistoryOut])
def get_history(
    ticket_id: int,
    db: Session = Depends(get_db),
    admin: Dict[str, Any] = Depends(require_admin),
):
    ticket = svc.get_ticket_for_user(db, ticket_id, admin)
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
