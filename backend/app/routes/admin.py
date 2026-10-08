"""Staff directory and reports (admin only)."""
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import require_admin
from app.schemas.ticket import AnalyticsOut, ReportOut, StaffOut
from app.services import analytics_service, directory
from app.services.ticket_service import report_stats

router = APIRouter(prefix="/api/helpdesk", tags=["admin"])


@router.get("/staff", response_model=List[StaffOut])
def staff(_: Dict[str, Any] = Depends(require_admin)):
    return directory.list_staff()


@router.get("/reports", response_model=ReportOut)
def reports(db: Session = Depends(get_db), _: Dict[str, Any] = Depends(require_admin)):
    return report_stats(db)


@router.get("/analytics", response_model=AnalyticsOut)
def analytics(
    days: int = Query(30, ge=7, le=180),
    db: Session = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin),
):
    return analytics_service.analytics(db, days)


@router.get("/reports/tickets.csv")
def export_tickets(
    created_from: Optional[date] = None,
    created_to: Optional[date] = None,
    db: Session = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin),
):
    body = analytics_service.export_csv(db, created_from, created_to)
    return Response(
        content=body,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="tickets.csv"'},
    )
