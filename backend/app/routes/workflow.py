"""Approvals, feedback survey and per-category SLA rules."""
from typing import Any, Dict, List

from fastapi import APIRouter, BackgroundTasks, Depends, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user, require_admin
from app.schemas.ticket import (
    ApprovalDecision,
    FeedbackIn,
    FeedbackOut,
    SlaRuleIn,
    SlaRuleOut,
    TicketOut,
)
from app.services import approval_service, feedback_service, sla_service
from app.services import notification_service as notify
from app.services import ticket_service as svc

router = APIRouter(prefix="/api/helpdesk", tags=["workflow"])


@router.get("/approvals", response_model=List[TicketOut])
def pending_approvals(
    db: Session = Depends(get_db), user: Dict[str, Any] = Depends(get_current_user)
):
    return approval_service.list_pending(db, user)


@router.post("/tickets/{ticket_id}/approval", response_model=TicketOut)
def decide_approval(
    ticket_id: int,
    data: ApprovalDecision,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    ticket = svc.get_ticket_for_user(db, ticket_id, user)
    ticket = approval_service.decide(db, ticket, user, data.decision == "approve", data.comment)
    notify.approval_decided(background, ticket, user)
    return ticket


@router.post(
    "/tickets/{ticket_id}/feedback", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED
)
def submit_feedback(
    ticket_id: int,
    data: FeedbackIn,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    ticket = svc.get_ticket_for_user(db, ticket_id, user)
    return feedback_service.submit(db, ticket, user, data.rating, data.comment)


@router.get("/sla-rules", response_model=List[SlaRuleOut])
def list_sla_rules(db: Session = Depends(get_db), _: Dict[str, Any] = Depends(require_admin)):
    return sla_service.list_rules(db)


@router.put("/sla-rules/{category_id}", response_model=List[SlaRuleOut])
def set_sla_rule(
    category_id: int,
    data: SlaRuleIn,
    db: Session = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin),
):
    sla_service.set_rule(db, category_id, data.response_hours, data.resolution_hours)
    return sla_service.list_rules(db)


@router.delete("/sla-rules/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def reset_sla_rule(
    category_id: int,
    db: Session = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin),
):
    sla_service.delete_rule(db, category_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
