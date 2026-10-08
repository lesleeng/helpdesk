"""Custom SLA targets per category."""
from sqlalchemy import Column, DateTime, ForeignKey, Integer
from datetime import datetime

from app.database import Base


class SlaRule(Base):
    __tablename__ = "sla_rules"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(
        Integer, ForeignKey("ticket_categories.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    response_hours = Column(Integer, nullable=False)
    resolution_hours = Column(Integer, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
