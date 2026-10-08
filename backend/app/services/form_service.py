"""Admin-defined request forms: field templates per request type, and input validation."""
import re
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.category import TicketCategory, TicketSubcategory
from app.schemas.ticket import FieldDef, SubcategoryCreate, SubcategoryUpdate


def _unprocessable(message: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, message)


def get_subcategory(db: Session, sub_id: int) -> TicketSubcategory:
    sub = db.get(TicketSubcategory, sub_id)
    if sub is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request type not found")
    return sub


def set_fields(db: Session, sub: TicketSubcategory, fields: List[FieldDef]) -> TicketSubcategory:
    sub.extra_fields_template = {"fields": [f.model_dump(exclude_none=True) for f in fields]}
    db.commit()
    db.refresh(sub)
    return sub


def create_subcategory(db: Session, category_id: int, data: SubcategoryCreate) -> TicketSubcategory:
    if db.get(TicketCategory, category_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    existing = (
        db.query(TicketSubcategory).filter(TicketSubcategory.category_id == category_id).all()
    )
    if any(s.name.lower() == data.name.strip().lower() for s in existing):
        raise HTTPException(status.HTTP_409_CONFLICT, "A request type with this name exists")
    sub = TicketSubcategory(
        category_id=category_id,
        name=data.name.strip(),
        order=max((s.order or 0 for s in existing), default=0) + 1,
        extra_fields_template={"fields": []},
        requires_approval=data.requires_approval,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def update_subcategory(
    db: Session, sub: TicketSubcategory, data: SubcategoryUpdate
) -> TicketSubcategory:
    changes = data.model_dump(exclude_unset=True)
    if "name" in changes:
        name = changes["name"].strip()
        clash = (
            db.query(TicketSubcategory)
            .filter(
                TicketSubcategory.category_id == sub.category_id,
                TicketSubcategory.id != sub.id,
            )
            .all()
        )
        if any(s.name.lower() == name.lower() for s in clash):
            raise HTTPException(status.HTTP_409_CONFLICT, "A request type with this name exists")
        sub.name = name
    for key in ("requires_approval", "active"):
        if key in changes and changes[key] is not None:
            setattr(sub, key, changes[key])
    db.commit()
    db.refresh(sub)
    return sub


_NUMBER = re.compile(r"^-?\d+(\.\d+)?$")


def validate_extra_fields(
    sub: Optional[TicketSubcategory], values: Dict[str, str]
) -> Dict[str, str]:
    """Check submitted extra fields against the request type's form; returns cleaned values."""
    fields: List[Dict[str, Any]] = (
        ((sub.extra_fields_template or {}).get("fields") or []) if sub else []
    )
    if not fields:
        return {k: v for k, v in values.items() if str(v).strip()}
    defined = {f["name"]: f for f in fields}
    cleaned: Dict[str, str] = {}
    for name, raw in values.items():
        value = str(raw).strip()
        if name not in defined:
            raise _unprocessable(f"Unknown field: {name}")
        if not value:
            continue
        spec = defined[name]
        if len(value) > 500:
            raise _unprocessable(f"{spec['label']} is too long (500 characters at most)")
        if spec["type"] == "number" and not _NUMBER.match(value):
            raise _unprocessable(f"{spec['label']} must be a number")
        if spec["type"] == "date":
            try:
                date.fromisoformat(value)
            except ValueError:
                raise _unprocessable(f"{spec['label']} must be a date (YYYY-MM-DD)")
        if spec["type"] == "select" and value not in (spec.get("options") or []):
            raise _unprocessable(f"{spec['label']} must be one of the listed options")
        cleaned[name] = value
    for name, spec in defined.items():
        if spec.get("required") and name not in cleaned:
            raise _unprocessable(f"{spec['label']} is required")
    return cleaned
