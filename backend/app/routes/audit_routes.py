# app/routes/audit_routes.py
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from backend.app.utils.firestore_utils import get_db
from backend.app.core.auth import require_permission
import logging

router = APIRouter()
logger = logging.getLogger("uvicorn.error")


def _to_datetime(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if hasattr(value, "to_datetime"):
        try:
            return value.to_datetime()
        except Exception:
            return None
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


def _resident_age(record):
    age = record.get("age")
    if isinstance(age, (int, float)):
        return int(age)
    if isinstance(age, str):
        try:
            return int(age)
        except ValueError:
            pass

    birth_value = record.get("birthDate") or record.get("dateOfBirth") or record.get("dob")
    birth_date = _to_datetime(birth_value)
    if not birth_date:
        return None

    today = datetime.utcnow().date()
    bday = birth_date.date()
    years = today.year - bday.year
    if (today.month, today.day) < (bday.month, bday.day):
        years -= 1
    return years

@router.get("/", tags=["Audit"])
def list_audit_logs(limit: int = 50):
    """
    Return the latest document audit logs.
    """
    try:
        logs = (
            get_db().collection("document_audit")
            .order_by("timestamp", direction="DESCENDING")
            .limit(limit)
            .stream()
        )
        return [log.to_dict() for log in logs]
    except Exception as e:
        logger.error("❌ Error fetching audit logs: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs")


@router.get("/summary", tags=["Audit"])
def get_audit_summary(_: str = Depends(require_permission("auditBarangayData"))):
    """
    Return high-level audit counts for admin and DILG dashboards.
    Uses server-side Firestore access to avoid client rule read issues.
    """
    try:
        db = get_db()
        residents_docs = list(db.collection("residents").stream())

        youth_count = 0
        for resident_doc in residents_docs:
            data = resident_doc.to_dict() or {}
            age = _resident_age(data)
            if isinstance(age, int) and 15 <= age <= 24:
                youth_count += 1

        response = {
            "residents": len(residents_docs),
            "youth": youth_count,
            "businesses": len(list(db.collection("businesses").stream())),
            "documents": len(list(db.collection("documents").stream())),
            "logins": len(list(db.collection("logins").stream())),
            "auditLogs": len(list(db.collection("document_audit").stream())),
        }

        return response
    except Exception as e:
        logger.error("❌ Error fetching audit summary: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch audit summary")
