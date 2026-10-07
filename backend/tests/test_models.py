"""
Tests for database models.
"""
import pytest
from datetime import datetime
from app.models.ticket import (
    Ticket,
    TicketComment,
    TicketHistory,
    TicketAttachment,
    TicketStatus,
    TicketPriority,
    TicketUrgency,
)
from app.models.category import TicketCategory, TicketSubcategory, TicketExtraFields


def test_ticket_category_creation(db):
    """Test creating a ticket category."""
    category = TicketCategory(
        name="Service Request",
        description="User service requests",
        color="#0066cc",
        order=1,
    )
    db.add(category)
    db.commit()
    db.refresh(category)

    assert category.id is not None
    assert category.name == "Service Request"
    assert category.active is True
    assert category.created_at is not None


def test_ticket_subcategory_creation(db):
    """Test creating a ticket subcategory."""
    category = TicketCategory(name="Service Request")
    db.add(category)
    db.commit()

    subcategory = TicketSubcategory(
        category_id=category.id,
        name="Access Request",
        description="Request for system access",
        order=1,
    )
    db.add(subcategory)
    db.commit()
    db.refresh(subcategory)

    assert subcategory.id is not None
    assert subcategory.category_id == category.id
    assert subcategory.name == "Access Request"


def test_ticket_creation(db):
    """Test creating a ticket."""
    category = TicketCategory(name="Service Request")
    db.add(category)
    db.commit()

    ticket = Ticket(
        title="Cannot login to system",
        description="I'm unable to access my account",
        user_id="user-1",
        category_id=category.id,
        status=TicketStatus.OPEN,
        priority=TicketPriority.HIGH,
        urgency=TicketUrgency.HIGH,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    assert ticket.id is not None
    assert ticket.status == TicketStatus.OPEN
    assert ticket.priority == TicketPriority.HIGH
    assert ticket.created_at is not None
    assert ticket.resolved_at is None
    assert ticket.reopen_count == 0


def test_ticket_comment_creation(db):
    """Test adding a comment to a ticket."""
    category = TicketCategory(name="Service Request")
    db.add(category)
    db.commit()

    ticket = Ticket(
        title="Test Ticket",
        description="Test description",
        user_id="user-1",
        category_id=category.id,
    )
    db.add(ticket)
    db.commit()

    comment = TicketComment(
        ticket_id=ticket.id,
        user_id="user-1",
        content="This is a comment",
        is_internal=False,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)

    assert comment.id is not None
    assert comment.ticket_id == ticket.id
    assert comment.content == "This is a comment"


def test_ticket_history_creation(db):
    """Test creating a ticket history entry (audit log)."""
    category = TicketCategory(name="Service Request")
    db.add(category)
    db.commit()

    ticket = Ticket(
        title="Test Ticket",
        description="Test description",
        user_id="user-1",
        category_id=category.id,
    )
    db.add(ticket)
    db.commit()

    history = TicketHistory(
        ticket_id=ticket.id,
        changed_by_id="admin-1",
        field_name="status",
        old_value=TicketStatus.OPEN.value,
        new_value=TicketStatus.IN_PROGRESS.value,
        change_type="status_change",
    )
    db.add(history)
    db.commit()
    db.refresh(history)

    assert history.id is not None
    assert history.ticket_id == ticket.id
    assert history.field_name == "status"
    assert history.old_value == "open"
    assert history.new_value == "in_progress"


def test_ticket_attachment_creation(db):
    """Test adding an attachment to a ticket."""
    category = TicketCategory(name="Service Request")
    db.add(category)
    db.commit()

    ticket = Ticket(
        title="Test Ticket",
        description="Test description",
        user_id="user-1",
        category_id=category.id,
    )
    db.add(ticket)
    db.commit()

    attachment = TicketAttachment(
        ticket_id=ticket.id,
        file_name="document.pdf",
        file_path="uploads/user-1/document.pdf",
        file_size=102400,
        file_type="application/pdf",
        uploaded_by_id="user-1",
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)

    assert attachment.id is not None
    assert attachment.file_name == "document.pdf"
    assert attachment.file_size == 102400


def test_ticket_extra_fields(db):
    """Test creating extra fields for a ticket."""
    category = TicketCategory(name="Service Request")
    db.add(category)
    db.commit()

    subcategory = TicketSubcategory(
        category_id=category.id,
        name="Access Request",
    )
    db.add(subcategory)
    db.commit()

    ticket = Ticket(
        title="Access Request",
        description="Need access to database",
        user_id="user-1",
        category_id=category.id,
        subcategory_id=subcategory.id,
    )
    db.add(ticket)
    db.commit()

    extra_field = TicketExtraFields(
        ticket_id=ticket.id,
        subcategory_id=subcategory.id,
        field_name="database_name",
        field_value="production_db",
    )
    db.add(extra_field)
    db.commit()
    db.refresh(extra_field)

    assert extra_field.id is not None
    assert extra_field.field_name == "database_name"
    assert extra_field.field_value == "production_db"


def test_ticket_relationships(db):
    """Test relationships between ticket and related models."""
    category = TicketCategory(name="Service Request")
    db.add(category)
    db.commit()

    ticket = Ticket(
        title="Test Ticket",
        description="Test description",
        user_id="user-1",
        category_id=category.id,
    )
    db.add(ticket)
    db.commit()

    # Add comment
    comment = TicketComment(ticket_id=ticket.id, user_id="user-1", content="A comment")
    db.add(comment)

    # Add history entry
    history = TicketHistory(
        ticket_id=ticket.id,
        changed_by_id="admin-1",
        field_name="status",
        old_value="open",
        new_value="in_progress",
    )
    db.add(history)
    db.commit()

    # Reload ticket
    db.refresh(ticket)

    assert len(ticket.comments) == 1
    assert len(ticket.history) == 1
    assert ticket.category.name == "Service Request"
