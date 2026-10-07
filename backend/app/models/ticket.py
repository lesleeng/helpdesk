"""
Core ticket models: Ticket, Comment, History, Attachment.
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.database import Base


class TicketStatus(str, enum.Enum):
    """Ticket status flow."""

    OPEN = "open"
    IN_PROGRESS = "in_progress"
    ON_HOLD = "on_hold"
    RESOLVED = "resolved"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class TicketPriority(str, enum.Enum):
    """Priority levels (set by admin based on urgency)."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TicketUrgency(str, enum.Enum):
    """User-submitted urgency level."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Ticket(Base):
    """Main ticket record."""

    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=False)
    user_id = Column(String(100), nullable=False, index=True)  # From workmate's system
    category_id = Column(Integer, ForeignKey("ticket_categories.id"), nullable=False)
    subcategory_id = Column(Integer, ForeignKey("ticket_subcategories.id"), nullable=True)
    status = Column(SQLEnum(TicketStatus), default=TicketStatus.OPEN, index=True)
    priority = Column(SQLEnum(TicketPriority), default=TicketPriority.MEDIUM)
    urgency = Column(SQLEnum(TicketUrgency), default=TicketUrgency.MEDIUM)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    reopen_count = Column(Integer, default=0)
    last_reopened_at = Column(DateTime, nullable=True)

    category = relationship("TicketCategory", back_populates="tickets")
    subcategory = relationship("TicketSubcategory", back_populates="tickets")
    comments = relationship("TicketComment", back_populates="ticket", cascade="all, delete-orphan")
    history = relationship("TicketHistory", back_populates="ticket", cascade="all, delete-orphan")
    attachments = relationship(
        "TicketAttachment", back_populates="ticket", cascade="all, delete-orphan"
    )
    extra_fields = relationship(
        "TicketExtraFields", back_populates="ticket", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Ticket #{self.id} {self.title}>"


class TicketComment(Base):
    """Comment on a ticket (conversation thread)."""

    __tablename__ = "ticket_comments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(
        Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = Column(String(100), nullable=False, index=True)  # From workmate's system
    content = Column(Text, nullable=False)
    is_internal = Column(Boolean, default=False)  # Internal notes (admin only)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    ticket = relationship("Ticket", back_populates="comments")
    attachments = relationship(
        "TicketAttachment", back_populates="comment", cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<TicketComment on ticket #{self.ticket_id}>"


class TicketHistory(Base):
    """Audit log: tracks all changes to a ticket."""

    __tablename__ = "ticket_history"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(
        Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    changed_by_id = Column(String(100), nullable=False, index=True)  # User who made change
    field_name = Column(String(100), nullable=False)
    old_value = Column(Text)
    new_value = Column(Text)
    change_type = Column(String(50))  # "status_change", "priority_change", "comment_added", etc.
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    ticket = relationship("Ticket", back_populates="history")

    def __repr__(self):
        return f"<TicketHistory ticket #{self.ticket_id} {self.field_name}>"


class TicketAttachment(Base):
    """File attachment on ticket or comment."""

    __tablename__ = "ticket_attachments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(
        Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    comment_id = Column(
        Integer, ForeignKey("ticket_comments.id", ondelete="CASCADE"), nullable=True
    )
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)  # Relative to UPLOAD_DIR
    file_size = Column(Integer)  # Bytes
    file_type = Column(String(50))  # MIME type
    uploaded_by_id = Column(String(100), nullable=False)  # From workmate's system
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    ticket = relationship("Ticket", back_populates="attachments")
    comment = relationship("TicketComment", back_populates="attachments")

    def __repr__(self):
        return f"<TicketAttachment {self.file_name}>"
