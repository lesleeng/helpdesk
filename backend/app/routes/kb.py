"""Knowledge base endpoints and ticket <-> article links."""
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user, require_admin, require_staff
from app.schemas.ticket import (
    KbArticleCreate,
    KbArticleOut,
    KbArticleUpdate,
    KbLinkRequest,
    KbListOut,
)
from app.services import kb_service as kb
from app.services import ticket_service as svc

router = APIRouter(prefix="/api/helpdesk", tags=["knowledge-base"])


@router.get("/kb/articles", response_model=KbListOut)
def list_articles(
    q: Optional[str] = None,
    category_id: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    items, total = kb.search(db, user, q, category_id, page, page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/kb/suggest", response_model=List[KbArticleOut])
def suggest(
    q: str = Query(min_length=3, max_length=500),
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: Dict[str, Any] = Depends(get_current_user),
):
    return kb.suggest(db, q, category_id)


@router.get("/kb/articles/{article_id}", response_model=KbArticleOut)
def get_article(
    article_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    return kb.get(db, user, article_id)


@router.post("/kb/articles", response_model=KbArticleOut, status_code=status.HTTP_201_CREATED)
def create_article(
    data: KbArticleCreate,
    db: Session = Depends(get_db),
    admin: Dict[str, Any] = Depends(require_admin),
):
    return kb.create(db, admin, data)


@router.patch("/kb/articles/{article_id}", response_model=KbArticleOut)
def update_article(
    article_id: int,
    data: KbArticleUpdate,
    db: Session = Depends(get_db),
    admin: Dict[str, Any] = Depends(require_admin),
):
    return kb.update(db, kb.get(db, admin, article_id), data)


@router.delete("/kb/articles/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article(
    article_id: int,
    db: Session = Depends(get_db),
    admin: Dict[str, Any] = Depends(require_admin),
):
    kb.delete(db, kb.get(db, admin, article_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/tickets/{ticket_id}/kb", response_model=List[KbArticleOut])
def ticket_articles(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    ticket = svc.get_ticket_for_user(db, ticket_id, user)
    return kb.linked_articles(db, ticket, user)


@router.post("/tickets/{ticket_id}/kb", response_model=List[KbArticleOut])
def link_article(
    ticket_id: int,
    data: KbLinkRequest,
    db: Session = Depends(get_db),
    staff: Dict[str, Any] = Depends(require_staff),
):
    ticket = svc.get_ticket_for_staff(db, ticket_id, staff)
    kb.link(db, ticket, staff, data.article_id)
    return kb.linked_articles(db, ticket, staff)


@router.delete("/tickets/{ticket_id}/kb/{article_id}", response_model=List[KbArticleOut])
def unlink_article(
    ticket_id: int,
    article_id: int,
    db: Session = Depends(get_db),
    staff: Dict[str, Any] = Depends(require_staff),
):
    ticket = svc.get_ticket_for_staff(db, ticket_id, staff)
    kb.unlink(db, ticket, staff, article_id)
    return kb.linked_articles(db, ticket, staff)
