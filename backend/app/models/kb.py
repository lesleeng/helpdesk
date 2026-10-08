"""Knowledge base articles and their links to tickets."""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from app.database import Base


class KbArticle(Base):
    __tablename__ = "kb_articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    body = Column(Text, nullable=False)
    tags = Column(String(300), nullable=True)  # comma separated
    category_id = Column(Integer, ForeignKey("ticket_categories.id"), nullable=True)
    published = Column(Boolean, default=False, nullable=False)
    created_by_id = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TicketKbLink(Base):
    __tablename__ = "ticket_kb_links"
    __table_args__ = (UniqueConstraint("ticket_id", "article_id", name="uq_ticket_article"),)

    id = Column(Integer, primary_key=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    article_id = Column(Integer, ForeignKey("kb_articles.id", ondelete="CASCADE"), nullable=False)
    linked_by_id = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
