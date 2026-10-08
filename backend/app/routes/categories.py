"""Category and dashboard endpoints."""
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import get_current_user, require_admin
from app.models.category import TicketCategory, TicketSubcategory
from app.schemas.ticket import (
    CategoryOut,
    DashboardOut,
    FieldsIn,
    SubcategoryCreate,
    SubcategoryOut,
    SubcategoryUpdate,
)
from app.services import form_service
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
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: Dict[str, Any] = Depends(get_current_user),
):
    if db.get(TicketCategory, category_id) is None:
        raise HTTPException(404, "Category not found")
    query = db.query(TicketSubcategory).filter(TicketSubcategory.category_id == category_id)
    if not (include_inactive and user.get("role") == "admin"):
        query = query.filter(TicketSubcategory.active.is_(True))
    return query.order_by(TicketSubcategory.order, TicketSubcategory.id).all()


@router.post(
    "/categories/{category_id}/subcategories",
    response_model=SubcategoryOut,
    status_code=status.HTTP_201_CREATED,
)
def create_subcategory(
    category_id: int,
    data: SubcategoryCreate,
    db: Session = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin),
):
    return form_service.create_subcategory(db, category_id, data)


@router.patch("/subcategories/{sub_id}", response_model=SubcategoryOut)
def update_subcategory(
    sub_id: int,
    data: SubcategoryUpdate,
    db: Session = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin),
):
    return form_service.update_subcategory(db, form_service.get_subcategory(db, sub_id), data)


@router.put("/subcategories/{sub_id}/fields", response_model=SubcategoryOut)
def set_subcategory_fields(
    sub_id: int,
    data: FieldsIn,
    db: Session = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin),
):
    return form_service.set_fields(db, form_service.get_subcategory(db, sub_id), data.fields)


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db), _: Dict[str, Any] = Depends(require_admin)):
    return dashboard_stats(db)


@router.get("/me")
def me(user: Dict[str, Any] = Depends(get_current_user)):
    return user
