"""Outbound webhooks and their delivery log."""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String

from app.database import Base


class Webhook(Base):
    __tablename__ = "webhooks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    url = Column(String(500), nullable=False)
    secret = Column(String(100), nullable=False)
    events = Column(String(500), nullable=False, default="*")  # comma separated, or "*"
    active = Column(Boolean, nullable=False, default=True)
    created_by_id = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class WebhookDelivery(Base):
    __tablename__ = "webhook_deliveries"

    id = Column(Integer, primary_key=True)
    webhook_id = Column(
        Integer, ForeignKey("webhooks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event = Column(String(60), nullable=False)
    ticket_id = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending|success|failed
    response_code = Column(Integer, nullable=True)
    attempts = Column(Integer, nullable=False, default=0)
    error = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    delivered_at = Column(DateTime, nullable=True)
