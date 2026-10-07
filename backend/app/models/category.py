"""
Ticket category and subcategory models.
Defines the 4 main request categories and 28 subcategories.
"""
from sqlalchemy import Column, Integer, String, Text, ForeignKey, JSON, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class TicketCategory(Base):
    """Main ticket categories (Service, Incident, Maintenance, HR-Init)."""
    __tablename__ = "ticket_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text)
    color = Column(String(7), default="#0066cc")  # Hex color for UI
    order = Column(Integer, default=0)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    subcategories = relationship("TicketSubcategory", back_populates="category", cascade="all, delete-orphan")
    tickets = relationship("Ticket", back_populates="category")

    def __repr__(self):
        return f"<TicketCategory {self.name}>"


class TicketSubcategory(Base):
    """Subcategories under each main category."""
    __tablename__ = "ticket_subcategories"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("ticket_categories.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False, index=True)
    description = Column(Text)
    order = Column(Integer, default=0)
    active = Column(Boolean, default=True)
    extra_fields_template = Column(JSON, default=dict)  # Template for extra fields
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    category = relationship("TicketCategory", back_populates="subcategories")
    tickets = relationship("Ticket", back_populates="subcategory")
    extra_fields = relationship("TicketExtraFields", back_populates="subcategory")

    def __repr__(self):
        return f"<TicketSubcategory {self.name}>"


class TicketExtraFields(Base):
    """
    Dynamic extra fields per ticket.
    Stores category-specific data (access request details, equipment type, etc.)
    """
    __tablename__ = "ticket_extra_fields"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id", ondelete="CASCADE"), nullable=False)
    subcategory_id = Column(Integer, ForeignKey("ticket_subcategories.id"), nullable=True)
    field_name = Column(String(100), nullable=False)
    field_value = Column(String(500))  # Or JSON for complex values
    created_at = Column(DateTime, default=datetime.utcnow)

    ticket = relationship("Ticket", back_populates="extra_fields")
    subcategory = relationship("TicketSubcategory", back_populates="extra_fields")

    def __repr__(self):
        return f"<TicketExtraFields {self.field_name}={self.field_value}>"
