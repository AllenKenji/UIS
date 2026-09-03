# app/routes/audit_routes.py
import calendar
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from backend.app.utils.firestore_utils import get_db
from backend.app.core.auth import require_permission
import logging

router = APIRouter()
logger = logging.getLogger("uvicorn.error")
LOCAL_TZ = timezone(timedelta(hours=8))


def _to_datetime(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(LOCAL_TZ).replace(tzinfo=None) if value.tzinfo else value
    if hasattr(value, "to_datetime"):
        try:
            converted = value.to_datetime()
            return converted.astimezone(LOCAL_TZ).replace(tzinfo=None) if getattr(converted, "tzinfo", None) else converted
        except Exception:
            return None
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed.astimezone(LOCAL_TZ).replace(tzinfo=None) if parsed.tzinfo else parsed
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

    today = datetime.now(LOCAL_TZ).date()
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


def _resolve_period_window(period_type: Optional[str], year: Optional[int], month: Optional[str]):
    now = datetime.now(LOCAL_TZ)
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
    for key in ("datePaid", "paidAt", "paymentDate", "createdAt", "date", "timestamp", "updatedAt"):
        parsed = _to_datetime(payment.get(key))
        if parsed:
            return parsed
    return None


def _resolve_record_date(key: str, record: dict):
    if key == "businesses":
        candidates = ("submittedAt", "createdAt", "timestamp", "created_at", "updatedAt")
    elif key == "collections":
        candidates = ("datePaid", "paymentDate", "timestamp", "createdAt")
    elif key == "logins":
        candidates = ("timestamp", "createdAt")
    else:
        candidates = ("createdAt", "timestamp", "created_at", "updatedAt", "date")

    for field in candidates:
        parsed = _to_datetime(record.get(field))
        if parsed:
            return parsed
    return None


def _is_within_range(value: Optional[datetime], start: datetime, end: datetime) -> bool:
    return bool(value and start <= value < end)


def _is_paid_status(payment: dict) -> bool:
    status = str(payment.get("paymentStatus") or payment.get("status") or "").strip().lower()
    return status == "paid"


def _normalize_status(value) -> str:
    return str(value or "").strip().lower()


def _is_unpaid_business(record: dict) -> bool:
    payment_status = _normalize_status(record.get("paymentStatus"))
    status = _normalize_status(record.get("status"))
    return payment_status == "unpaid" or status == "for_payment"


def _resolve_collection_date(record: dict):
    for key in ("datePaid", "paidAt", "paymentDate", "createdAt", "date", "updatedAt"):
        parsed = _to_datetime(record.get(key))
        if parsed:
            return parsed
    return None


def _paid_transactions(db) -> list[dict]:
    """Every transaction (payment/business/document) currently in a "paid"
    state, deduped by transactionId/id — same merge get_audit_summary and
    the series endpoint both build their collections totals from, factored
    out so the two don't drift out of sync with each other."""
    payments = [
        {"id": snap.id, "entityType": "payment", **(snap.to_dict() or {})}
        for snap in db.collection("payments").stream()
    ]

    businesses = [
        {
            "id": snap.id,
            "entityType": "business",
            "amount": (snap.to_dict() or {}).get("amount"),
            "paymentStatus": "unpaid",
            **(snap.to_dict() or {}),
        }
        for snap in db.collection("businesses").stream()
        if _is_unpaid_business(snap.to_dict() or {})
    ]

    documents = [
        {
            "id": snap.id,
            "entityType": "document",
            "amount": (snap.to_dict() or {}).get("amount"),
            "paymentStatus": (snap.to_dict() or {}).get("paymentStatus") or (snap.to_dict() or {}).get("status") or "unpaid",
            **(snap.to_dict() or {}),
        }
        for snap in db.collection("documents").stream()
    ]

    merged = [*payments, *businesses, *documents]
    unique: dict[str, dict] = {}

    for tx in merged:
        key = str(tx.get("transactionId") or tx.get("id"))
        if key not in unique:
            unique[key] = tx
            continue

        existing = unique[key]
        if existing.get("entityType") != "payment" and tx.get("entityType") == "payment":
            unique[key] = tx

    return [
        tx for tx in unique.values()
        if _normalize_status(tx.get("paymentStatus") or tx.get("status")) == "paid"
    ]


def _build_collection_amount(db, period_start: datetime, period_end: datetime) -> float:
    collections_amount = 0.0
    for tx in _paid_transactions(db):
        date_value = _resolve_collection_date(tx)
        if not date_value or not (period_start <= date_value < period_end):
            continue

        collections_amount += _to_number(tx.get("amount"))

    return round(collections_amount, 2)

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
    periodType: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[str] = Query(None),
    _: str = Depends(require_permission("auditBarangayData")),
):
    """
    Return high-level audit counts for admin and DILG dashboards.
    Uses server-side Firestore access to avoid client rule read issues.
    """
    try:
        period_start, period_end = _resolve_period_window(periodType, year, month)
        db = get_db()

        def _count_in_period(collection_name: str):
            docs = list(db.collection(collection_name).stream())
            return sum(
                1
                for item in docs
                if _is_within_range(
                    _resolve_record_date(collection_name, item.to_dict() or {}),
                    period_start,
                    period_end,
                )
            )

        residents_docs = list(db.collection("residents").stream())
        residents_count = 0
        youth_count = 0
        for resident_doc in residents_docs:
            data = resident_doc.to_dict() or {}
            created_at = _resolve_record_date("residents", data)
            if not _is_within_range(created_at, period_start, period_end):
                continue
            residents_count += 1
            age = _resident_age(data)
            if isinstance(age, int) and 15 <= age <= 24:
                youth_count += 1

        response = {
            "residents": residents_count,
            "youth": youth_count,
            "businesses": _count_in_period("businesses"),
            "documents": _count_in_period("documents"),
            "logins": _count_in_period("logins"),
            "complaints": _count_in_period("complaints"),
            "incidents": _count_in_period("incidents"),
            "auditLogs": _count_in_period("document_audit"),
        }

        response["collectionsAmount"] = _build_collection_amount(db, period_start, period_end)

        return response
    except Exception as e:
        logger.error("❌ Error fetching audit summary: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch audit summary")


def _monthly_bucket_windows(year: int, month: int) -> list[tuple[str, Optional[datetime], Optional[datetime]]]:
    """Always 31 fixed slots (Day 1..31), so a 30/28/29-day month still lines
    up index-for-index against a 31-day month on the same chart — days past
    the end of the month get no window (left as None) rather than a bucket
    that would otherwise silently read 0."""
    days_in_month = calendar.monthrange(year, month)[1]
    windows = []
    for day in range(1, 32):
        if day <= days_in_month:
            start = datetime(year, month, day)
            windows.append((str(day), start, start + timedelta(days=1)))
        else:
            windows.append((str(day), None, None))
    return windows


def _yearly_bucket_windows(year: int) -> list[tuple[str, datetime, datetime]]:
    return [
        (
            datetime(year, m, 1).strftime("%b"),
            datetime(year, m, 1),
            datetime(year + (1 if m == 12 else 0), 1 if m == 12 else m + 1, 1),
        )
        for m in range(1, 13)
    ]


@router.get("/summary/series", tags=["Audit"])
def get_audit_summary_series(
    periodType: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[str] = Query(None),
    _: str = Depends(require_permission("auditBarangayData")),
):
    """
    Per-bucket breakdown of the same metrics get_audit_summary totals up —
    Day 1..31 within one month, or Jan..Dec within one year — for the admin
    analytics line chart. Always returns a fixed-length bucket list (31 for
    monthly, 12 for yearly) so a "current" and "compare" series drawn on the
    same chart line up by index even when their months have different
    lengths; a day past a shorter month's end comes back as null values
    instead of a misleading 0.
    """
    try:
        db = get_db()
        normalized = (periodType or "").strip().lower()
        now = datetime.now(LOCAL_TZ)

        if normalized == "yearly":
            safe_year = year if isinstance(year, int) and 2000 <= year <= 9999 else now.year
            windows = _yearly_bucket_windows(safe_year)
        else:
            source = month or now.strftime("%Y-%m")
            try:
                year_part, month_part = source.split("-")
                safe_year, safe_month = int(year_part), int(month_part)
                if not (1 <= safe_month <= 12):
                    raise ValueError
            except Exception:
                safe_year, safe_month = now.year, now.month
            windows = _monthly_bucket_windows(safe_year, safe_month)

        residents_docs = [snap.to_dict() or {} for snap in db.collection("residents").stream()]

        def _collection_docs(name: str):
            return [snap.to_dict() or {} for snap in db.collection(name).stream()]

        businesses_docs = _collection_docs("businesses")
        documents_docs = _collection_docs("documents")
        logins_docs = _collection_docs("logins")
        complaints_docs = _collection_docs("complaints")
        incidents_docs = _collection_docs("incidents")
        paid_transactions = _paid_transactions(db)

        def _count_in_window(docs, collection_name, start, end):
            return sum(
                1
                for data in docs
                if _is_within_range(_resolve_record_date(collection_name, data), start, end)
            )

        buckets = []
        for label, start, end in windows:
            if start is None:
                buckets.append({
                    "label": label,
                    "residents": None,
                    "youth": None,
                    "businesses": None,
                    "documents": None,
                    "logins": None,
                    "complaints": None,
                    "incidents": None,
                    "collectionsAmount": None,
                })
                continue

            residents_count = 0
            youth_count = 0
            for data in residents_docs:
                created_at = _resolve_record_date("residents", data)
                if not _is_within_range(created_at, start, end):
                    continue
                residents_count += 1
                age = _resident_age(data)
                if isinstance(age, int) and 15 <= age <= 24:
                    youth_count += 1

            collections_amount = 0.0
            for tx in paid_transactions:
                date_value = _resolve_collection_date(tx)
                if not date_value or not (start <= date_value < end):
                    continue
                collections_amount += _to_number(tx.get("amount"))

            buckets.append({
                "label": label,
                "residents": residents_count,
                "youth": youth_count,
                "businesses": _count_in_window(businesses_docs, "businesses", start, end),
                "documents": _count_in_window(documents_docs, "documents", start, end),
                "logins": _count_in_window(logins_docs, "logins", start, end),
                "complaints": _count_in_window(complaints_docs, "complaints", start, end),
                "incidents": _count_in_window(incidents_docs, "incidents", start, end),
                "collectionsAmount": round(collections_amount, 2),
            })

        return {"periodType": "yearly" if normalized == "yearly" else "monthly", "buckets": buckets}
    except Exception as e:
        logger.error("❌ Error fetching audit summary series: %s", str(e), exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch audit summary series")
