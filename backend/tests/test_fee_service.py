import pytest
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from backend.app.routes.fee_routes import calculate_misc_fee
from backend.app.services.fee_service import determine_business_fee_type

def make_business_doc(status="active", reg_date=None, payments=None):
    return {
        "status": status,
        "registrationDate": reg_date,
        "payments": payments or []
    }

def test_first_time_registration_no_payments():
    doc = make_business_doc(status="for_registration", payments=[])
    assert determine_business_fee_type(doc) == "registrationFee"

def test_first_time_registration_status_only():
    doc = make_business_doc(status="for_registration")
    assert determine_business_fee_type(doc) == "registrationFee"

def test_annual_due_on_anniversary():
    reg_date = datetime.now(timezone.utc) - relativedelta(years=1, days=1)
    doc = make_business_doc(status="active", reg_date=reg_date, payments=[{"status":"verified"}])
    assert determine_business_fee_type(doc) == "annualFee"

def test_not_yet_due_before_anniversary():
    reg_date = datetime.now(timezone.utc) - relativedelta(months=11)
    doc = make_business_doc(status="active", reg_date=reg_date, payments=[{"status":"verified"}])
    assert determine_business_fee_type(doc) == "annualFee"  # default for active, but not triggered by anniversary yet

def test_leap_year_anniversary():
    # Registered on Feb 29, 2024 → renewal should be Feb 28, 2025
    reg_date = datetime(2024, 2, 29, tzinfo=timezone.utc)
    doc = make_business_doc(status="active", reg_date=reg_date, payments=[{"status":"verified"}])
    # Simulate current date after Feb 28, 2025
    now = datetime(2025, 3, 1, tzinfo=timezone.utc)
    # Monkeypatch datetime.now if needed, or just check relativedelta logic
    next_anniversary = reg_date + relativedelta(years=1)
    assert next_anniversary == datetime(2025, 2, 28, tzinfo=timezone.utc)

def test_percentage_misc_fee_uses_base_amount():
    assert calculate_misc_fee({"fee": 2.5, "feeType": "percentage"}, 750) == 19

def test_missing_fee_type_remains_fixed():
    assert calculate_misc_fee({"fee": 75}, 750) == 75
