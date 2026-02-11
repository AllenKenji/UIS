from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta

def determine_business_fee_type(business_doc: dict) -> str:
    """
    Pure business rule: decide registrationFee vs annualFee.
    No Firestore or external dependencies.
    """
    status = business_doc.get("status")
    reg_date = business_doc.get("registrationDate")
    payments = business_doc.get("payments", [])

    if status == "for_registration" or not payments:
        return "registrationFee"

    if reg_date:
        try:
            if isinstance(reg_date, str):
                reg_dt = datetime.fromisoformat(reg_date).replace(tzinfo=timezone.utc)
            elif isinstance(reg_date, datetime):
                reg_dt = reg_date if reg_dt.tzinfo else reg_date.replace(tzinfo=timezone.utc)
            else:
                reg_dt = reg_date.to_datetime().replace(tzinfo=timezone.utc)

            next_anniversary = reg_dt + relativedelta(years=1)
            now = datetime.now(timezone.utc)
            if now >= next_anniversary:
                return "annualFee"
        except Exception:
            return "annualFee"

    return "annualFee"
