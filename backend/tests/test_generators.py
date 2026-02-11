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

def quick_check(name, pdf_bytes):
    print(f"{name}: {len(pdf_bytes)} bytes")
    assert isinstance(pdf_bytes, (bytes, bytearray))
    assert len(pdf_bytes) > 1000  # sanity check

if __name__ == "__main__":
    quick_check("Barangay Clearance", generate_barangay_clearance_pdf(resident, issued_by, issued_at, doc_id))
    quick_check("Residency Certificate", generate_residency_certificate_pdf(resident, issued_by, issued_at, doc_id))
    quick_check("Indigency Certificate", generate_indigency_certificate_pdf(resident, issued_by, issued_at, doc_id))
    quick_check("Good Moral Certificate", generate_good_moral_certificate_pdf(resident, issued_by, issued_at, doc_id))
    quick_check("Business Clearance", generate_business_clearance_pdf("Sample Business", "Juan Dela Cruz", resident["address"], issued_by, issued_at, doc_id))
    quick_check("Activity Permit", generate_activity_permit_pdf("Juan Dela Cruz", "Community Cleanup", resident["address"], issued_at, issued_by, issued_at, doc_id))
    quick_check("Blotter Report", generate_blotter_report_pdf("Complainant", "Respondent", "Noise Complaint", resident["address"], issued_at, issued_by, issued_at, doc_id))
    quick_check("Health Certificate", generate_health_certificate_pdf(resident, "Employment Requirement", issued_by, issued_at, doc_id))
    quick_check("Barangay ID", generate_barangay_id_pdf(resident, issued_by, issued_at, doc_id))

generators = {
    "barangay_clearance.pdf": generate_barangay_clearance_pdf(resident, issued_by, issued_at, doc_id),
    "residency_certificate.pdf": generate_residency_certificate_pdf(resident, issued_by, issued_at, doc_id),
    "indigency_certificate.pdf": generate_indigency_certificate_pdf(resident, issued_by, issued_at, doc_id),
    "good_moral_certificate.pdf": generate_good_moral_certificate_pdf(resident, issued_by, issued_at, doc_id),
    "business_clearance.pdf": generate_business_clearance_pdf("Sample Business", "Juan Dela Cruz", resident["address"], issued_by, issued_at, doc_id),
    "activity_permit.pdf": generate_activity_permit_pdf("Juan Dela Cruz", "Community Cleanup", resident["address"], issued_at, issued_by, issued_at, doc_id),
    "blotter_report.pdf": generate_blotter_report_pdf("Complainant", "Respondent", "Noise Complaint", resident["address"], issued_at, issued_by, issued_at, doc_id),
    "health_certificate.pdf": generate_health_certificate_pdf(resident, "Employment Requirement", issued_by, issued_at, doc_id),
    "barangay_id.pdf": generate_barangay_id_pdf(resident, issued_by, issued_at, doc_id),
}

for filename, pdf_bytes in generators.items():
    with open(filename, "wb") as f:
        f.write(pdf_bytes)
    print(f"Saved {filename}")
