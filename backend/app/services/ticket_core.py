"""Small helpers shared by the ticket services (kept dependency-free to avoid import cycles)."""
from typing import Any, Dict

from sqlalchemy.orm import Session

from app.models.ticket import TicketHistory


def is_admin(user: Dict[str, Any]) -> bool:
    return user.get("role") == "admin"


def log_history(
    db: Session, ticket_id: int, user_id: str, field: str, old: Any, new: Any, kind: str
) -> None:
    db.add(
        TicketHistory(
            ticket_id=ticket_id,
            changed_by_id=user_id,
            field_name=field,
            old_value=None if old is None else str(getattr(old, "value", old)),
            new_value=None if new is None else str(getattr(new, "value", new)),
            change_type=kind,
        )
    )
