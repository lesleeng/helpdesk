"""Per-category SLA targets, falling back to the global defaults."""
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.category import TicketCategory
from app.models.sla import SlaRule


def sla_hours(db: Session, category_id: int) -> Tuple[int, int]:
    rule = db.query(SlaRule).filter(SlaRule.category_id == category_id).first()
    if rule:
        return rule.response_hours, rule.resolution_hours
    return settings.SLA_RESPONSE_TIME_HOURS, settings.SLA_RESOLUTION_TIME_HOURS


def list_rules(db: Session) -> List[Dict[str, object]]:
    """One row per active category, with the effective targets and whether they are custom."""
    rules = {r.category_id: r for r in db.query(SlaRule).all()}
    rows = []
    for cat in db.query(TicketCategory).order_by(TicketCategory.order, TicketCategory.id).all():
        rule: Optional[SlaRule] = rules.get(cat.id)
        rows.append(
            {
                "category_id": cat.id,
                "category_name": cat.name,
                "response_hours": rule.response_hours if rule else settings.SLA_RESPONSE_TIME_HOURS,
                "resolution_hours": (
                    rule.resolution_hours if rule else settings.SLA_RESOLUTION_TIME_HOURS
                ),
                "custom": rule is not None,
            }
        )
    return rows


def set_rule(db: Session, category_id: int, response_hours: int, resolution_hours: int) -> None:
    if db.get(TicketCategory, category_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    if resolution_hours < response_hours:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Resolution target cannot be shorter than the response target",
        )
    rule = db.query(SlaRule).filter(SlaRule.category_id == category_id).first()
    if rule is None:
        rule = SlaRule(category_id=category_id)
        db.add(rule)
    rule.response_hours = response_hours
    rule.resolution_hours = resolution_hours
    db.commit()


def delete_rule(db: Session, category_id: int) -> None:
    db.query(SlaRule).filter(SlaRule.category_id == category_id).delete()
    db.commit()
