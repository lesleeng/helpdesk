"""Outbound webhooks: registration, signed delivery with retries, SSRF guard."""
import hashlib
import hmac
import ipaddress
import json
import logging
import secrets
import socket
import time
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import httpx
from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.models.webhook import Webhook, WebhookDelivery

logger = logging.getLogger(__name__)

EVENTS = [
    "ticket.created",
    "ticket.status_changed",
    "ticket.assigned",
    "ticket.commented",
    "ticket.approval_requested",
    "ticket.approval_decided",
    "ticket.feedback_submitted",
]
RETRY_DELAYS = (0, 1, 3)  # seconds before attempts 1, 2, 3
TIMEOUT = 5.0


# ---- URL safety ----
def resolve_host(host: str) -> List[str]:
    try:
        return sorted({info[4][0] for info in socket.getaddrinfo(host, None)})
    except socket.gaierror:
        return []


def check_url(url: str) -> Optional[str]:
    """Return a reason the URL must not be called, or None if it is acceptable."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return "URL must start with http:// or https://"
    if parsed.username or parsed.password:
        return "URL must not contain credentials"
    if settings.WEBHOOKS_ALLOW_PRIVATE:
        return None
    addresses = resolve_host(parsed.hostname)
    if not addresses:
        return "Host name could not be resolved"
    for addr in addresses:
        try:
            if not ipaddress.ip_address(addr).is_global:
                return "URL points to a private or internal address"
        except ValueError:
            return "Host resolved to an invalid address"
    return None


def sign(secret: str, body: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


# ---- registration ----
def _validate(url: str, events: List[str]) -> None:
    reason = check_url(url)
    if reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, reason)
    unknown = [e for e in events if e != "*" and e not in EVENTS]
    if unknown:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown event: {unknown[0]}")


def create(db: Session, admin: Dict[str, Any], name: str, url: str, events: List[str]) -> Webhook:
    events = events or ["*"]
    _validate(url, events)
    hook = Webhook(
        name=name,
        url=url,
        secret=secrets.token_urlsafe(32),
        events=",".join(dict.fromkeys(events)),
        active=True,
        created_by_id=admin["id"],
    )
    db.add(hook)
    db.commit()
    db.refresh(hook)
    return hook


def get(db: Session, hook_id: int) -> Webhook:
    hook = db.get(Webhook, hook_id)
    if hook is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Webhook not found")
    return hook


def update(db: Session, hook: Webhook, data: Dict[str, Any]) -> Webhook:
    if "url" in data or "events" in data:
        _validate(data.get("url", hook.url), data.get("events", hook.events.split(",")))
    if "name" in data:
        hook.name = data["name"]
    if "url" in data:
        hook.url = data["url"]
    if "events" in data:
        hook.events = ",".join(dict.fromkeys(data["events"] or ["*"]))
    if "active" in data:
        hook.active = data["active"]
    db.commit()
    db.refresh(hook)
    return hook


def rotate_secret(db: Session, hook: Webhook) -> Webhook:
    hook.secret = secrets.token_urlsafe(32)
    db.commit()
    db.refresh(hook)
    return hook


def delete(db: Session, hook: Webhook) -> None:
    db.delete(hook)
    db.commit()


def deliveries(db: Session, hook: Webhook, limit: int = 50) -> List[WebhookDelivery]:
    return (
        db.query(WebhookDelivery)
        .filter(WebhookDelivery.webhook_id == hook.id)
        .order_by(WebhookDelivery.id.desc())
        .limit(limit)
        .all()
    )


# ---- delivery ----
def http_post(url: str, body: str, headers: Dict[str, str]) -> int:
    response = httpx.post(
        url, content=body, headers=headers, timeout=TIMEOUT, follow_redirects=False
    )
    return response.status_code


def deliver(session_factory: Callable[[], Session], delivery_id: int, body: str) -> None:
    """Send one payload, retrying with backoff; records the outcome on the delivery row."""
    with session_factory() as db:
        delivery = db.get(WebhookDelivery, delivery_id)
        hook = db.get(Webhook, delivery.webhook_id) if delivery else None
        if delivery is None or hook is None:
            return
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "helpdesk-webhooks/1",
            "X-Helpdesk-Event": delivery.event,
            "X-Helpdesk-Delivery": str(uuid.uuid4()),
            "X-Helpdesk-Signature": sign(hook.secret, body),
        }
        for delay in RETRY_DELAYS:
            if delay:
                time.sleep(delay)
            delivery.attempts += 1
            reason = check_url(hook.url)  # re-check: DNS may have changed since registration
            if reason:
                delivery.status, delivery.error, delivery.response_code = "failed", reason, None
                break
            try:
                code = http_post(hook.url, body, headers)
                delivery.response_code, delivery.error = code, None
                if 200 <= code < 300:
                    delivery.status, delivery.delivered_at = "success", datetime.utcnow()
                    break
                delivery.status = "failed"
                delivery.error = f"Receiver answered HTTP {code}"
            except httpx.HTTPError as exc:
                delivery.status, delivery.response_code = "failed", None
                delivery.error = f"{type(exc).__name__}: {exc}"[:300]
            db.commit()
        db.commit()


def _matches(hook: Webhook, event: str) -> bool:
    wanted = hook.events.split(",")
    return "*" in wanted or event in wanted


def dispatch(db: Session, bg: BackgroundTasks, event: str, payload: Dict[str, Any]) -> None:
    hooks = [
        h for h in db.query(Webhook).filter(Webhook.active.is_(True)).all() if _matches(h, event)
    ]
    if not hooks:
        return
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True)
    factory = sessionmaker(bind=db.get_bind())
    for hook in hooks:
        delivery = WebhookDelivery(
            webhook_id=hook.id, event=event, ticket_id=(payload.get("ticket") or {}).get("id")
        )
        db.add(delivery)
        db.commit()
        bg.add_task(deliver, factory, delivery.id, body)


def send_test(
    db: Session, bg: BackgroundTasks, hook: Webhook, admin: Dict[str, Any]
) -> WebhookDelivery:
    body = json.dumps(
        {
            "id": str(uuid.uuid4()),
            "event": "ping",
            "created_at": datetime.utcnow().isoformat() + "Z",
            "actor": {"id": admin["id"], "name": admin.get("name")},
            "data": {"message": "Test delivery from the help desk"},
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    delivery = WebhookDelivery(webhook_id=hook.id, event="ping")
    db.add(delivery)
    db.commit()
    db.refresh(delivery)
    bg.add_task(deliver, sessionmaker(bind=db.get_bind()), delivery.id, body)
    return delivery


def split_events(hook: Webhook) -> Tuple[str, ...]:
    return tuple(hook.events.split(","))
