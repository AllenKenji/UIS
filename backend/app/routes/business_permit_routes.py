"""Business permit lifecycle: 30-day-before-expiry warning and automatic
expiration. There is no in-process scheduler in this app (and running one
inside the web dyno would double-fire once you scale to 2+ instances), so
this is exposed as a single protected endpoint meant to be called once a
day by an external trigger (a Render Cron Job) — the same shared-secret
pattern already used by the /internal/fdp/* endpoints in account_routes.py.

Residents who register a business never log in (no account, no
notification bell to see), so the only channel that reliably reaches them
is the email on file for the business — no in-app notification is sent
here.
"""

import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, status
from fastapi.concurrency import run_in_threadpool

from backend.app.services.email_service import send_email
from backend.app.services.notification_service import NotificationService
from backend.app.services.payment_service import parse_iso_datetime
from backend.app.utils.firestore_utils import get_db

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/internal/business-permits", tags=["Business Permits"])

WARNING_WINDOW_DAYS = 30


async def _email_owner(business: dict, kind: str, message: str) -> None:
    email = (business.get("email") or "").strip()
    if not email:
        logger.warning(
            "⚠️ No email on file for business %s (%s) — cannot send %s notice",
            business.get("businessId") or business.get("id"), business.get("businessName"), kind,
        )
        return
    try:
        await run_in_threadpool(
            send_email,
            "permit_expiring" if kind == "expiring" else "permit_expired",
            email,
            business.get("ownerName") or "Resident",
            None,
            message,
        )
    except Exception as err:
        logger.warning("⚠️ Failed to email %s about permit %s: %s", email, kind, err)


async def _notify_staff(message: str) -> None:
    for role in ("admin", "staff"):
        try:
            await NotificationService.notify(role=role, type="business_permit", message=message)
        except Exception as err:
            logger.warning("⚠️ Failed to notify role=%s about permit expiration: %s", role, err)


@router.post("/check-expirations")
async def check_business_permit_expirations(
    x_bis_permit_check_key: str | None = Header(default=None),
):
    """Meant to be called once a day by a Render Cron Job. For every
    approved business: warns the owner by email once when validUntil is
    within 30 days, and marks the business "expired" (and emails the
    owner) once validUntil has passed without a renewal payment."""
    expected_key = os.environ.get("BUSINESS_PERMIT_CHECK_KEY", "").strip()
    provided_key = (x_bis_permit_check_key or "").strip()
    if not expected_key or provided_key != expected_key:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    now = datetime.now(timezone.utc)
    warned = 0
    expired = 0

    docs = list(get_db().collection("businesses").where("status", "==", "approved").stream())
    for doc in docs:
        data = doc.to_dict() or {}
        valid_until = parse_iso_datetime(data.get("validUntil"))
        if not valid_until:
            continue  # legacy record with no tracked expiry — nothing to check

        business_name = data.get("businessName") or "your business"

        if valid_until <= now:
            await run_in_threadpool(
                doc.reference.update, {"status": "expired", "updatedAt": now.isoformat()}
            )
            expired += 1
            await _email_owner(
                data, "expired",
                f"Your business permit for {business_name} has expired.",
            )
            await _notify_staff(f"Business permit expired: {business_name}")
            continue

        days_left = (valid_until - now).days
        if days_left <= WARNING_WINDOW_DAYS and not data.get("permitExpiryNoticeSent"):
            await run_in_threadpool(doc.reference.update, {"permitExpiryNoticeSent": True})
            warned += 1
            plural = "" if days_left == 1 else "s"
            await _email_owner(
                data, "expiring",
                f"Your business permit for {business_name} expires in {days_left} day{plural}.",
            )

    logger.info("✅ Business permit expiration check: checked=%s warned=%s expired=%s", len(docs), warned, expired)
    return {"success": True, "checked": len(docs), "warned": warned, "expired": expired}
