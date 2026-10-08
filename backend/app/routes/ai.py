"""AI assistance endpoints (advisory only)."""
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.middleware.auth import get_current_user, require_staff
from app.schemas.ticket import (
    AiCategorizeIn,
    AiCategorizeOut,
    AiReplyOut,
    AiStatusOut,
    DuplicateOut,
)
from app.services import ai_service, duplicate_service, kb_service
from app.services import ticket_service as svc

router = APIRouter(prefix="/api/helpdesk", tags=["ai"])


def _guard(fn, *args):
    try:
        return fn(*args)
    except ai_service.AIDisabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "AI assistance is not configured")
    except ai_service.AIRateLimited:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "AI request limit reached; try later"
        )
    except ai_service.AIError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))


@router.get("/ai/status", response_model=AiStatusOut)
def ai_status(_: Dict[str, Any] = Depends(get_current_user)):
    return {"enabled": ai_service.is_enabled(), "model": settings.AI_MODEL}


@router.post("/ai/categorize", response_model=AiCategorizeOut)
def categorize(
    data: AiCategorizeIn,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    return _guard(ai_service.categorize, db, user["id"], data.title, data.description)


@router.post("/tickets/{ticket_id}/ai/suggest-response", response_model=AiReplyOut)
def suggest_response(
    ticket_id: int,
    db: Session = Depends(get_db),
    staff: Dict[str, Any] = Depends(require_staff),
):
    ticket = svc.get_ticket_for_staff(db, ticket_id, staff)
    articles = {a.id: a for a in kb_service.linked_articles(db, ticket, staff)}
    for a in kb_service.suggest(db, f"{ticket.title} {ticket.description}", ticket.category_id):
        articles.setdefault(a.id, a)
    picked = list(articles.values())[:5]
    result = _guard(ai_service.suggest_reply, db, staff["id"], ticket, picked)
    return {**result, "articles": picked}


@router.get("/tickets/{ticket_id}/duplicates", response_model=List[DuplicateOut])
def duplicates(
    ticket_id: int,
    db: Session = Depends(get_db),
    staff: Dict[str, Any] = Depends(require_staff),
):
    ticket = svc.get_ticket_for_staff(db, ticket_id, staff)
    return duplicate_service.find_duplicates(db, ticket)
