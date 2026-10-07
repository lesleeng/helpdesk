"""Category and dashboard endpoints."""
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user, require_admin
from app.models.category import TicketCategory, TicketSubcategory
from app.schemas.ticket import CategoryOut, DashboardOut, SubcategoryOut
from app.services.ticket_service import dashboard_stats

router = APIRouter(prefix="/api/helpdesk", tags=["categories"])


@router.get("/categories", response_model=List[CategoryOut])
def list_categories(db: Session = Depends(get_db), _: Dict[str, Any] = Depends(get_current_user)):
    return (
        db.query(TicketCategory)
        .filter(TicketCategory.active.is_(True))
        .order_by(TicketCategory.order, TicketCategory.id)
        .all()
    )


@router.get("/categories/{category_id}/subcategories", response_model=List[SubcategoryOut])
def list_subcategories(
    category_id: int,
    db: Session = Depends(get_db),
    _: Dict[str, Any] = Depends(get_current_user),
):
    if db.get(TicketCategory, category_id) is None:
        raise HTTPException(404, "Category not found")
    return (
        db.query(TicketSubcategory)
        .filter(TicketSubcategory.category_id == category_id, TicketSubcategory.active.is_(True))
        .order_by(TicketSubcategory.order, TicketSubcategory.id)
        .all()
    )


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db), _: Dict[str, Any] = Depends(require_admin)):
    return dashboard_stats(db)
