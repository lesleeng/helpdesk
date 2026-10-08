"""Knowledge base: articles, keyword search with simple ranking, ticket links."""
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.kb import KbArticle, TicketKbLink
from app.models.ticket import Ticket
from app.schemas.ticket import KbArticleCreate, KbArticleUpdate
from app.services.ticket_core import log_history

STOPWORDS = {"the", "and", "for", "with", "that", "this", "from", "have", "not", "are", "was"}


def terms(text: str, limit: int = 8) -> List[str]:
    found = [t for t in re.findall(r"[a-z0-9]{3,}", text.lower()) if t not in STOPWORDS]
    return list(dict.fromkeys(found))[:limit]


def _visible(db: Session, user: Dict[str, Any]):
    q = db.query(KbArticle)
    if user.get("role") not in ("admin", "tech"):
        q = q.filter(KbArticle.published.is_(True))
    return q


def _score(article: KbArticle, ts: List[str]) -> int:
    title, body, tags = article.title.lower(), article.body.lower(), (article.tags or "").lower()
    return sum(3 * (t in title) + 2 * (t in tags) + (t in body) for t in ts)


def search(
    db: Session,
    user: Dict[str, Any],
    q: Optional[str],
    category_id: Optional[int],
    page: int,
    page_size: int,
) -> Tuple[List[KbArticle], int]:
    query = _visible(db, user)
    if category_id:
        query = query.filter(KbArticle.category_id == category_id)
    ts = terms(q or "")
    if q and ts:
        clauses = []
        for t in ts:
            like = f"%{t}%"
            clauses += [
                KbArticle.title.ilike(like),
                KbArticle.body.ilike(like),
                KbArticle.tags.ilike(like),
            ]
        candidates = query.filter(or_(*clauses)).limit(500).all()
        ranked = sorted(candidates, key=lambda a: (-_score(a, ts), -a.updated_at.timestamp()))
    else:
        ranked = query.order_by(KbArticle.updated_at.desc(), KbArticle.id.desc()).all()
    start = (page - 1) * page_size
    return ranked[start : start + page_size], len(ranked)


def suggest(db: Session, text: str, category_id: Optional[int], limit: int = 5) -> List[KbArticle]:
    """Published articles that best match free text (e.g. a ticket being written)."""
    ts = terms(text)
    if not ts:
        return []
    clauses = []
    for t in ts:
        like = f"%{t}%"
        clauses += [KbArticle.title.ilike(like), KbArticle.body.ilike(like)]
    candidates = db.query(KbArticle).filter(KbArticle.published.is_(True), or_(*clauses)).all()
    scored = [
        (_score(a, ts) + (2 if category_id and a.category_id == category_id else 0), a)
        for a in candidates
    ]
    scored.sort(key=lambda sa: -sa[0])
    return [a for s, a in scored if s > 0][:limit]


def get(db: Session, user: Dict[str, Any], article_id: int) -> KbArticle:
    article = _visible(db, user).filter(KbArticle.id == article_id).first()
    if article is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Article not found")
    return article


def create(db: Session, user: Dict[str, Any], data: KbArticleCreate) -> KbArticle:
    article = KbArticle(**data.model_dump(), created_by_id=user["id"])
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


def update(db: Session, article: KbArticle, data: KbArticleUpdate) -> KbArticle:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(article, field, value)
    db.commit()
    db.refresh(article)
    return article


def delete(db: Session, article: KbArticle) -> None:
    db.delete(article)
    db.commit()


def linked_articles(db: Session, ticket: Ticket, user: Dict[str, Any]) -> List[KbArticle]:
    q = (
        _visible(db, user)
        .join(TicketKbLink, TicketKbLink.article_id == KbArticle.id)
        .filter(TicketKbLink.ticket_id == ticket.id)
    )
    return q.order_by(TicketKbLink.created_at, TicketKbLink.id).all()


def link(db: Session, ticket: Ticket, user: Dict[str, Any], article_id: int) -> None:
    article = db.get(KbArticle, article_id)
    if article is None or not article.published:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Article not found")
    exists = db.query(TicketKbLink).filter_by(ticket_id=ticket.id, article_id=article_id).first()
    if exists:
        return
    db.add(TicketKbLink(ticket_id=ticket.id, article_id=article_id, linked_by_id=user["id"]))
    log_history(db, ticket.id, user["id"], "kb_article", None, article.title, "kb_linked")
    db.commit()


def unlink(db: Session, ticket: Ticket, user: Dict[str, Any], article_id: int) -> None:
    db.query(TicketKbLink).filter_by(ticket_id=ticket.id, article_id=article_id).delete()
    db.commit()
