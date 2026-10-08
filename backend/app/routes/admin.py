"""Staff directory and reports (admin only)."""
from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.middleware.auth import require_admin
from app.schemas.ticket import ReportOut, StaffOut
from app.services import directory
from app.services.ticket_service import report_stats

router = APIRouter(prefix="/api/helpdesk", tags=["admin"])


@router.get("/staff", response_model=List[StaffOut])
def staff(_: Dict[str, Any] = Depends(require_admin)):
    return directory.list_staff()


@router.get("/reports", response_model=ReportOut)
def reports(db: Session = Depends(get_db), _: Dict[str, Any] = Depends(require_admin)):
    return report_stats(db)
