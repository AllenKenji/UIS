from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
from io import BytesIO
from datetime import datetime
import textwrap
import traceback

# 🔐 Utility
def safe_text(value):
    return str(value).encode("ascii", "ignore").decode("ascii")

def format_address(address):
    barangay = safe_text(address.get("barangay", "Unknown"))
    parts = [
        address.get("houseNumber", "").strip(),
        address.get("street", "").strip(),
        f"Purok {address.get('purok', '').strip()}" if address.get("purok") else "",
        address.get("city", "").strip(),
        f"Barangay {barangay}",
        address.get("province", "").strip()
    ]
    return safe_text(", ".join(part for part in parts if part)).title(), barangay

def draw_header(c, width, height, margin, barangay, title):
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width / 2, height - margin, "Republic of the Philippines")
    c.drawCentredString(width / 2, height - margin - 20, f"Barangay {barangay}")
    c.drawCentredString(width / 2, height - margin - 40, title)

def draw_footer(c, width, margin, doc_id):
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(margin, margin / 2, "This document is system-generated and valid without signature.")
    draw_qr_code(c, doc_id, margin, width)

def draw_qr_code(c, doc_id, margin, width):
    if not doc_id:
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(width - margin - 60, margin + 10, "(QR unavailable)")
        return
    try:
        qr_code = qr.QrCodeWidget(doc_id)
        size = 60
        d = Drawing(size, size)
        d.add(qr_code)
        renderPDF.draw(d, c, width - margin - size, margin + 10)
    except Exception:
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(width - margin - 60, margin + 10, "(QR error)")

def render_pdf_body(c, lines, issued_by, margin, width, height):
    line_height = 16
    current_y = height - margin - 80  # leave space for header
    usable_width = width - 2 * margin
    max_chars = int(usable_width / 6.5)

    c.setFont("Helvetica", 11)
    for line in lines:
        for wrapped in textwrap.wrap(line, width=max_chars):
            c.drawString(margin, current_y, wrapped)
            current_y -= line_height

    current_y -= line_height * 2
    c.drawString(margin, current_y, "Certified by:")
    current_y -= line_height
    c.setFont("Helvetica-Bold", 11)
    c.drawString(margin, current_y, safe_text(issued_by))


# 📜 Document 1: Barangay Clearance
def generate_barangay_clearance_pdf(resident, issued_by, issued_at, doc_id):
    try:
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=LETTER)
        width, height = LETTER
        margin = inch

        full_name = safe_text(resident.get("fullName", "Unnamed"))
        address = resident.get("address", {})
        full_address, barangay = format_address(address)

        draw_header(c, width, height, margin, barangay, "BARANGAY CLEARANCE")

        body_lines = [
            f"This is to certify that {full_name}, of legal age, currently residing at {full_address},",
            f"is of good moral character and has no derogatory record filed in this barangay.",
            f"This clearance is issued upon request for lawful purposes.",
            f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.",
            f"Document ID: {doc_id}"
        ]

        render_pdf_body(c, body_lines, issued_by, margin, width, height)
        draw_footer(c, width, margin, doc_id)

        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer.read()

    except Exception as e:
        print("❌ Error inside generate_barangay_clearance_pdf:", str(e))
        traceback.print_exc()
        raise


# 📜 Document 2: Certificate of Residency
def generate_residency_certificate_pdf(resident, issued_by, issued_at, doc_id):
    try:
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=LETTER)
        width, height = LETTER
        margin = inch

        full_name = safe_text(resident.get("fullName", "Unnamed"))
        address = resident.get("address", {})
        full_address, barangay = format_address(address)

        draw_header(c, width, height, margin, barangay, "CERTIFICATE OF RESIDENCY")
    

        body_lines = [
            f"This is to certify that {full_name}, of legal age, is a bonafide resident of Barangay {barangay},",
            f"currently residing at {full_address}.",
            f"This certificate is issued upon request for the purpose of establishing residency.",
            f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.",
            f"Document ID: {doc_id}"
        ]
        render_pdf_body(c, body_lines, issued_by, margin, width, height)
        draw_footer(c, width, margin, doc_id)

        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer.read()

    except Exception as e:
        print("❌ Error inside generate_residency_certificate_pdf:", str(e))
        traceback.print_exc()
        raise

# 📜 Document 3: Certificate of Indigency
def generate_indigency_certificate_pdf(resident, issued_by, issued_at, doc_id):
    try:
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=LETTER)
        width, height = LETTER
        margin = inch

        full_name = safe_text(resident.get("fullName", "Unnamed"))
        address = resident.get("address", {})
        full_address, barangay = format_address(address)

        draw_header(c, width, height, margin, barangay, "CERTIFICATE OF INDIGENCY")
    
        body_lines = [
            f"This is to certify that {full_name}, of legal age, currently residing at {full_address},",
            f"is recognized by Barangay {barangay} as a person of indigent status.",
            f"This certificate is issued upon request for the purpose of financial assistance or aid.",
            f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.",
            f"Document ID: {doc_id}"
        ]
        
        render_pdf_body(c, body_lines, issued_by, margin, width, height)
        draw_footer(c, width, margin, doc_id)

        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer.read()

    except Exception as e:
        print("❌ Error inside generate_indigency_certificate_pdf:", str(e))
        traceback.print_exc()
        raise

# 📜 Document 4: Certificate of Good Moral Character
def generate_good_moral_certificate_pdf(resident, issued_by, issued_at, doc_id):
    try:
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=LETTER)
        width, height = LETTER
        margin = inch

        full_name = safe_text(resident.get("fullName", "Unnamed"))
        address = resident.get("address", {})
        full_address, barangay = format_address(address)

        draw_header(c, width, height, margin, barangay, "CERTIFICATE OF GOOD MORAL CHARACTER")

        body_lines = [
            f"This is to certify that {full_name}, of legal age, residing at {full_address},",
            f"is known to possess good moral character and has no record of misconduct in this barangay.",
            f"This certificate is issued upon request for school, employment, or legal purposes.",
            f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.",
            f"Document ID: {doc_id}"
        ]

        render_pdf_body(c, body_lines, issued_by, margin, width, height)
        draw_footer(c, width, margin, doc_id)

        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer.read()

    except Exception as e:
        print("❌ Error inside generate_good_moral_certificate_pdf:", str(e))
        traceback.print_exc()
        raise

# 📜 Document 5: Barangay Business Clearance
def generate_business_clearance_pdf(business_name, owner, address, issued_by, issued_at, doc_id):
    try:
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=LETTER)
        width, height = LETTER
        margin = inch

        full_address, barangay = format_address(address)

        draw_header(c, width, height, margin, barangay, "BARANGAY BUSINESS CLEARANCE")

        body_lines = [
            f"This is to certify that the business named '{business_name}', owned by {safe_text(owner)},",
            f"located at {full_address}, is duly recognized and permitted to operate within Barangay {barangay}.",
            f"This clearance is issued for registration, renewal, or legal compliance.",
            f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.",
            f"Document ID: {doc_id}"
        ]

        render_pdf_body(c, body_lines, issued_by, margin, width, height)
        draw_footer(c, width, margin, doc_id)

        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer.read()

    except Exception as e:
        print("❌ Error inside generate_business_clearance_pdf:", str(e))
        traceback.print_exc()
        raise


# 📜 Document 6: Permit to Conduct Activity
def generate_activity_permit_pdf(organizer, activity_name, location, date, issued_by, issued_at, doc_id):
    try:
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=LETTER)
        width, height = LETTER
        margin = inch

        full_address, barangay = format_address(location)

        draw_header(c, width, height, margin, barangay, "PERMIT TO CONDUCT ACTIVITY")

        body_lines = [
            f"This is to certify that {safe_text(organizer)} is granted permission to conduct the activity titled '{safe_text(activity_name)}',",
            f"to be held at {full_address} on {date.strftime('%B %d, %Y')}.",
            f"This permit is issued in accordance with barangay regulations and public safety protocols.",
            f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.",
            f"Document ID: {doc_id}"
        ]

        render_pdf_body(c, body_lines, issued_by, margin, width, height)
        draw_footer(c, width, margin, doc_id)

        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer.read()

    except Exception as e:
        print("❌ Error inside generate_activity_permit_pdf:", str(e))
        traceback.print_exc()
        raise

# 📜 Document 7: Blotter Report
def generate_blotter_report_pdf(complainant, respondent, incident, location, date_reported, issued_by, issued_at, doc_id):
    try:
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=LETTER)
        width, height = LETTER
        margin = inch

        full_address, barangay = format_address(location)

        draw_header(c, width, height, margin, barangay, "BLOTTER REPORT")

        body_lines = [
            f"This is to certify that a blotter report was filed by {safe_text(complainant)} against {safe_text(respondent)},",
            f"regarding the following incident: {safe_text(incident)}.",
            f"The incident occurred at {full_address} and was reported on {date_reported.strftime('%B %d, %Y')}.",
            f"This report is recorded in the official barangay blotter log.",
            f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.",
            f"Document ID: {doc_id}"
        ]

        render_pdf_body(c, body_lines, issued_by, margin, width, height)
        draw_footer(c, width, margin, doc_id)

        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer.read()

    except Exception as e:
        print("❌ Error inside generate_blotter_report_pdf:", str(e))
        traceback.print_exc()
        raise

# 📜 Document 8: Health Certificate
def generate_health_certificate_pdf(resident, purpose, issued_by, issued_at, doc_id):
    try:
        buffer = BytesIO()
        c = canvas.Canvas(buffer, pagesize=LETTER)
        width, height = LETTER
        margin = inch

        full_name = safe_text(resident.get("fullName", "Unnamed"))
        address = resident.get("address", {})
        full_address, barangay = format_address(address)

        draw_header(c, width, height, margin, barangay, "HEALTH CERTIFICATE")
    
        body_lines = [
            f"This is to certify that {full_name}, residing at {full_address},",
            f"has undergone a medical check-up and is found to be in good health condition.",
            f"This certificate is issued for the purpose of {safe_text(purpose)}.",
            f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.",
            f"Document ID: {doc_id}"
        ]
        render_pdf_body(c, body_lines, issued_by, margin, width, height)
        draw_footer(c, width, margin, doc_id)

        c.showPage()
        c.save()
        buffer.seek(0)
        return buffer.read()

    except Exception as e:
        print("❌ Error inside generate_health_certificate_pdf:", str(e))
        traceback.print_exc()
        raise

# 📜 Document 9: Barangay ID
def generate_barangay_id_pdf(resident, issued_by, issued_at, doc_id):
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=LETTER)
    width, height = LETTER
    margin = inch

    # 🧠 Extract resident info
    full_name = safe_text(resident.get("fullName", "Unnamed"))
    gender = safe_text(resident.get("gender", ""))
    birth_date = safe_text(resident.get("birthDate", ""))
    contact = safe_text(resident.get("contactNumber", ""))
    voter_status = safe_text(resident.get("voterStatus", ""))
    occupation = safe_text(resident.get("occupation", ""))
    photo_url = resident.get("photoUrl", "")
    address = resident.get("address", {})
    barangay = safe_text(address.get("barangay", "Unknown"))
    full_address = safe_text(", ".join(part for part in [
        address.get("houseNumber", ""),
        address.get("street", ""),
        f"Barangay {barangay}",
        address.get("city", ""),
        address.get("province", "")
    ] if part)).title()

    # 🏷️ Header
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(width / 2, height - margin, "Republic of the Philippines")
    c.drawCentredString(width / 2, height - margin - 16, f"Barangay {barangay}")
    c.drawCentredString(width / 2, height - margin - 32, "BARANGAY RESIDENT ID")

    # 🖼️ Optional photo block
    if photo_url:
        try:
            c.drawImage(photo_url, width - margin - 80, height - margin - 100, width=60, height=60)
        except Exception as e:
            c.setFont("Helvetica-Oblique", 9)
            c.drawString(width - margin - 80, height - margin - 100, "(Photo unavailable)")
    else:
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(width - margin - 80, height - margin - 100, "(No photo provided)")

    # 📋 Resident details
    c.setFont("Helvetica", 11)
    line_height = 16
    current_y = height - margin - 120
    fields = [
        f"Name: {full_name}",
        f"Birth Date: {birth_date}",
        f"Gender: {gender}",
        f"Contact: {contact}",
        f"Occupation: {occupation}",
        f"Voter Status: {voter_status}",
        f"Address: {full_address}",
        f"Document ID: {doc_id}"
    ]
    for field in fields:
        c.drawString(margin, current_y, field)
        current_y -= line_height

    # 🧾 Footer
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(margin, margin / 2, "This ID is system-generated and valid for barangay transactions.")
    draw_qr_code(c, doc_id, margin, width)

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()






