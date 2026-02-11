from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from backend.app.services.fee_logic import determine_business_fee_type

def make_business_doc(status="active", reg_date=None, payments=None):
    return {
        "status": status,
        "registrationDate": reg_date,
        "payments": payments or []
    }

def test_first_time_registration():
    doc = make_business_doc(status="for_registration", payments=[])
    assert determine_business_fee_type(doc) == "registrationFee"

def test_due_for_annual_fee():
    reg_date = datetime.now(timezone.utc) - relativedelta(years=1, days=1)
    doc = make_business_doc(status="active", reg_date=reg_date, payments=[{"status":"verified"}])
    assert determine_business_fee_type(doc) == "annualFee"

def test_not_yet_due():
    reg_date = datetime.now(timezone.utc) - relativedelta(months=11)
    doc = make_business_doc(status="active", reg_date=reg_date, payments=[{"status":"verified"}])
    assert determine_business_fee_type(doc) == "annualFee"  # default for active
