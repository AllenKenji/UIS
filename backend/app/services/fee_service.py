from backend.app.routes.fee_routes import list_with_misc, list_collection
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta

# -----------------------------
# 🔧 Utility
# -----------------------------
def _normalize_key(value: str) -> str:
    """Normalize type strings for comparison (lowercase, underscores)."""
    return value.strip().lower().replace(" ", "_")

def _find_fee_record(collection: str, id_field: str, type_value: str) -> dict | None:
    """Find a fee record in Firestore collections with misc support."""
    fees = list_with_misc(collection) if collection in ["business_types", "document_types"] else list_collection(collection)
    key = _normalize_key(type_value)
    for fee in fees:
        if _normalize_key(fee[id_field]) == key:
            return fee
    return None

# -----------------------------
# 💰 Generic Fee Resolver
# -----------------------------
def resolve_fee(collection: str, id_field: str, type_value: str, fee_type: str | None = None) -> dict:
    """
    Generic fee resolver for business, document, and misc types.
    Returns a breakdown dict with base, main, misc, and total.
    """
    fee_record = _find_fee_record(collection, id_field, type_value)
    if not fee_record:
        raise ValueError(f"Fee not found for {type_value} in {collection}")

    misc = fee_record.get("miscFeeResolved") or 0

    if collection == "business_types":
        if not fee_type:
            raise ValueError("fee_type required for business_types (registrationFee or annualFee)")
        base = fee_record.get("fee", 0)  # common base fee
        main = fee_record.get(fee_type, 0)  # registrationFee or annualFee
    elif collection == "document_types":
        base = fee_record.get("fee", 0)  # document base fee
        main = 0  # avoid double-counting
    else:  # misc_fees
        base = 0
        main = fee_record.get("fee", 0)

    total = base + main + misc

    return {
        "baseFee": base,
        "mainFee": main,
        "miscFee": misc,
        "totalFee": total,
        "feeType": fee_type or "standard",
        "typeValue": type_value
    }

# -----------------------------
# 📄 Specific Resolvers
# -----------------------------
def resolve_document_fee(document_type: str) -> dict:
    """Resolve fee for a document type, including misc if enabled."""
    return resolve_fee("document_types", "documentType", document_type)

def resolve_business_fee(business_type: str, fee_type: str) -> dict:
    """
    Resolve fee for a business type.
    fee_type must be "registrationFee" or "annualFee".
    """
    return resolve_fee("business_types", "businessType", business_type, fee_type=fee_type)

def resolve_misc_fee(misc_type: str) -> dict:
    """Resolve fee for a standalone misc type."""
    return resolve_fee("misc_fees", "miscType", misc_type)

# -----------------------------
# 🏢 Business Fee Type Decision
# -----------------------------
def determine_business_fee_type(business_doc: dict) -> str:
    """
    Decide whether to charge registrationFee or annualFee
    based on status and calendar anniversaries.
    """
    status = business_doc.get("status")
    reg_date = business_doc.get("registrationDate")
    payments = business_doc.get("payments", [])

    # Case 1: First-time registration
    if status == "for_registration" or not payments:
        return "registrationFee"

    # Case 2: Annual renewal check (calendar anniversary)
    if reg_date:
        try:
            if isinstance(reg_date, str):
                reg_dt = datetime.fromisoformat(reg_date)
            elif isinstance(reg_date, datetime):
                reg_dt = reg_date
            elif hasattr(reg_date, "to_datetime"):
                reg_dt = reg_date.to_datetime()  # Firestore Timestamp
            else:
                return "annualFee"

            next_anniversary = reg_dt + relativedelta(years=1)
            now = datetime.now(timezone.utc)  # timezone-aware UTC datetime

            if now >= next_anniversary:
                return "annualFee"
            else:
                return "registrationFee"
        except Exception:
            return "annualFee"

    # Case 3: Default for active businesses
    return "annualFee"
