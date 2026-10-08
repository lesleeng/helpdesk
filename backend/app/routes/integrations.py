"""Admin endpoints for webhooks and integration status."""
from typing import Any, Dict, List

from fastapi import APIRouter, BackgroundTasks, Depends, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.middleware.auth import require_admin
from app.models.webhook import Webhook
from app.schemas.ticket import (
    DeliveryOut,
    IntegrationsStatus,
    WebhookCreated,
    WebhookIn,
    WebhookOut,
    WebhookUpdate,
)
from app.services import slack_service, webhook_service

router = APIRouter(prefix="/api/helpdesk", tags=["integrations"])


def _out(db: Session, hook: Webhook) -> Dict[str, Any]:
    latest = webhook_service.deliveries(db, hook, limit=1)
    return {
        "id": hook.id,
        "name": hook.name,
        "url": hook.url,
        "events": list(webhook_service.split_events(hook)),
        "active": hook.active,
        "created_at": hook.created_at,
        "last_status": latest[0].status if latest else None,
        "last_delivery_at": latest[0].created_at if latest else None,
    }


@router.get("/integrations", response_model=IntegrationsStatus)
def integrations_status(_: Dict[str, Any] = Depends(require_admin)):
    return {
        "slack_enabled": slack_service.is_enabled(),
        "webhook_events": webhook_service.EVENTS,
        "allow_private_webhooks": settings.WEBHOOKS_ALLOW_PRIVATE,
    }


@router.get("/webhooks", response_model=List[WebhookOut])
def list_webhooks(db: Session = Depends(get_db), _: Dict[str, Any] = Depends(require_admin)):
    return [_out(db, h) for h in db.query(Webhook).order_by(Webhook.id).all()]


@router.post("/webhooks", response_model=WebhookCreated, status_code=status.HTTP_201_CREATED)
def create_webhook(
    data: WebhookIn,
    db: Session = Depends(get_db),
    admin: Dict[str, Any] = Depends(require_admin),
):
    hook = webhook_service.create(db, admin, data.name, data.url, data.events)
    return {**_out(db, hook), "secret": hook.secret}


@router.patch("/webhooks/{hook_id}", response_model=WebhookOut)
def update_webhook(
    hook_id: int,
    data: WebhookUpdate,
    db: Session = Depends(get_db),
    _: Dict[str, Any] = Depends(require_admin),
):
    hook = webhook_service.update(
        db, webhook_service.get(db, hook_id), data.model_dump(exclude_unset=True)
    )
    return _out(db, hook)


@router.post("/webhooks/{hook_id}/rotate-secret", response_model=WebhookCreated)
def rotate_secret(
    hook_id: int, db: Session = Depends(get_db), _: Dict[str, Any] = Depends(require_admin)
):
    hook = webhook_service.rotate_secret(db, webhook_service.get(db, hook_id))
    return {**_out(db, hook), "secret": hook.secret}


@router.delete("/webhooks/{hook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_webhook(
    hook_id: int, db: Session = Depends(get_db), _: Dict[str, Any] = Depends(require_admin)
):
    webhook_service.delete(db, webhook_service.get(db, hook_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/webhooks/{hook_id}/test", response_model=DeliveryOut)
def test_webhook(
    hook_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: Dict[str, Any] = Depends(require_admin),
):
    return webhook_service.send_test(db, background, webhook_service.get(db, hook_id), admin)


@router.get("/webhooks/{hook_id}/deliveries", response_model=List[DeliveryOut])
def webhook_deliveries(
    hook_id: int, db: Session = Depends(get_db), _: Dict[str, Any] = Depends(require_admin)
):
    return webhook_service.deliveries(db, webhook_service.get(db, hook_id))
