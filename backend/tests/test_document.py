import pytest
from datetime import datetime
from backend.app.utils.barangay_documents import (
    generate_barangay_clearance_pdf,
    generate_residency_certificate_pdf,
    generate_indigency_certificate_pdf,
    generate_good_moral_certificate_pdf,
    generate_business_clearance_pdf,
    generate_activity_permit_pdf,
    generate_blotter_report_pdf,
    generate_health_certificate_pdf,
    generate_barangay_id_pdf,
)

# Common test data
resident = {
    "fullName": "Juan Dela Cruz",
    "address": {
        "houseNumber": "1243",
        "street": "St. Paul St",
        "purok": "1",
        "city": "Parañaque",
        "barangay": "Moonwalk",
        "province": "Metro Manila",
    },
    "gender": "Male",
    "birthDate": "1990-01-01",
    "contactNumber": "09123456789",
    "occupation": "Driver",
    "voterStatus": "Registered",
}

issued_by = "Sanya Lopez"
issued_at = datetime.now()
doc_id = "TEST-0001"

@pytest.mark.parametrize("generator,args", [
    (generate_barangay_clearance_pdf, [resident, issued_by, issued_at, doc_id]),
    (generate_residency_certificate_pdf, [resident, issued_by, issued_at, doc_id]),
    (generate_indigency_certificate_pdf, [resident, issued_by, issued_at, doc_id]),
    (generate_good_moral_certificate_pdf, [resident, issued_by, issued_at, doc_id]),
    (generate_business_clearance_pdf, ["Sample Business", "Juan Dela Cruz", resident["address"], issued_by, issued_at, doc_id]),
    (generate_activity_permit_pdf, ["Juan Dela Cruz", "Community Cleanup", resident["address"], issued_at, issued_by, issued_at, doc_id]),
    (generate_blotter_report_pdf, ["Complainant", "Respondent", "Noise Complaint", resident["address"], issued_at, issued_by, issued_at, doc_id]),
    (generate_health_certificate_pdf, [resident, "Employment Requirement", issued_by, issued_at, doc_id]),
    (generate_barangay_id_pdf, [resident, issued_by, issued_at, doc_id]),
])
def test_generators_return_pdf_bytes(generator, args):
    pdf_bytes = generator(*args)
    assert isinstance(pdf_bytes, (bytes, bytearray))
    assert len(pdf_bytes) > 1000  # sanity check: not empty
