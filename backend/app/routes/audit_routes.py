# app/routes/audit_routes.py
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
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


def _to_number(value):
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = "".join(ch for ch in value if ch.isdigit() or ch in ".-")
        try:
            return float(cleaned) if cleaned else 0.0
        except ValueError:
            return 0.0
    return 0.0


def _resolve_period_window(period_type: str | None, year: int | None, month: str | None):
    now = datetime.utcnow()
    normalized = (period_type or "").strip().lower()

    if normalized == "yearly":
        safe_year = year if isinstance(year, int) and 2000 <= year <= 9999 else now.year
        return datetime(safe_year, 1, 1), datetime(safe_year + 1, 1, 1)

    if normalized == "monthly":
        source = month or now.strftime("%Y-%m")
        try:
            year_part, month_part = source.split("-")
            safe_year = int(year_part)
            safe_month = int(month_part)
            if not (1 <= safe_month <= 12):
                raise ValueError
            start = datetime(safe_year, safe_month, 1)
            end = datetime(
                safe_year + (1 if safe_month == 12 else 0),
                1 if safe_month == 12 else safe_month + 1,
                1,
            )
            return start, end
        except Exception:
            pass

    return datetime(now.year, 1, 1), datetime(now.year + 1, 1, 1)


def _resolve_payment_date(payment: dict):
    for key in ("datePaid", "paidAt", "paymentDate", "createdAt", "timestamp", "updatedAt"):
        parsed = _to_datetime(payment.get(key))
        if parsed:
            return parsed
    return None

@router.get("/", tags=["Audit"])
def list_audit_logs(
    limit: int = 50,
    _: str = Depends(require_permission("auditBarangayData")),
):
    """
    Return the latest document audit logs.
    """
    try:
        logs = list(
            get_db().collection("document_audit")
            .order_by("timestamp", direction="DESCENDING")
            .limit(limit)
            .stream()
        )

        # If explicit audit logs are empty, derive timeline-like entries from documents
        # so oversight roles still see document activity history.
        if not logs:
            docs = list(get_db().collection("documents").stream())
            derived_logs = []

            for doc in docs:
                data = doc.to_dict() or {}
                status = str(data.get("status") or "").lower()
                if status == "approved":
                    action = "issued"
                elif status == "rejected":
                    action = "rejected"
                elif status == "paid":
                    action = "payment_confirmed"
                elif status in {"for_payment", "payment_submitted"}:
                    action = "payment_pending"
                else:
                    action = "requested"

                derived_logs.append(
                    {
                        "id": doc.id,
                        "doc_id": doc.id,
                        "document_type": data.get("documentType") or "N/A",
                        "action": action,
                        "performed_by": data.get("issuedBy") or "System",
                        "resident_name": data.get("residentName"),
                        "resident_id": data.get("residentId"),
                        "timestamp": data.get("updatedAt") or data.get("createdAt"),
                    }
                )

            def _sort_key(item):
                parsed = _to_datetime(item.get("timestamp"))
                return parsed or datetime.min

            derived_logs.sort(key=_sort_key, reverse=True)
            return derived_logs[:limit]

        return [log.to_dict() for log in logs]
    except Exception as e:
        logger.error("❌ Error fetching audit logs: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch audit logs")


@router.get("/summary", tags=["Audit"])
def get_audit_summary(
    periodType: str | None = Query(None),
    year: int | None = Query(None),
    month: str | None = Query(None),
    _: str = Depends(require_permission("auditBarangayData")),
):
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
            "complaints": len(list(db.collection("complaints").stream())),
            "incidents": len(list(db.collection("incidents").stream())),
            "auditLogs": len(list(db.collection("document_audit").stream())),
        }

        period_start, period_end = _resolve_period_window(periodType, year, month)
        payments = list(db.collection("payments").stream())
        collections_amount = 0.0
        for payment_doc in payments:
            payment = payment_doc.to_dict() or {}
            status = str(payment.get("paymentStatus") or payment.get("status") or "").strip().lower()
            paid_date = _resolve_payment_date(payment)
            if status in {"paid", "succeeded"} and paid_date and period_start <= paid_date < period_end:
                collections_amount += _to_number(payment.get("amount"))

        response["collectionsAmount"] = round(collections_amount, 2)

        return response
    except Exception as e:
        logger.error("❌ Error fetching audit summary: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch audit summary")
