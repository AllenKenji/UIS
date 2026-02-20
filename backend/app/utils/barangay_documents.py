from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from urllib.request import urlopen 
from reportlab.lib.utils import ImageReader
from reportlab.graphics import renderPDF
from io import BytesIO
import base64
from datetime import timedelta
import textwrap
from backend.app.utils.date_utils import parse_date
import json
import logging

logger = logging.getLogger("uvicorn.error")

def safe_text(value):
    return str(value) if value is not None else ""

def format_address(address):
    if isinstance(address, str):
        try:
            parsed = json.loads(address)
            address = {k.lower(): v for k, v in parsed.items()}
        except Exception:
            return safe_text(address), "Unknown"

    elif isinstance(address, dict):
        # ✅ normalize dict keys too
        address = {k.lower(): v for k, v in address.items() if v}
    else:
        return "Unknown address", "Unknown"

    barangay = safe_text(address.get("barangay", "Unknown")).title()
    street = safe_text(address.get("street", "")).title()
    city = safe_text(address.get("city", "")).title()
    province = safe_text(address.get("province", "")).title()
    house_number = safe_text(address.get("housenumber", "")).strip()
    purok = safe_text(address.get("purok", "")).strip()

    parts = []
    if house_number:
        parts.append(house_number)
    if street:
        parts.append(street)
    if purok:
        parts.append(f"Purok {purok}")
    if barangay and not barangay.lower().startswith("barangay"):
        parts.append(f"Barangay {barangay}")
    elif barangay:
        parts.append(barangay)
    if city:
        parts.append(city)
    if province:
        parts.append(province)

    full_address = ", ".join(parts)
    return full_address, barangay

def draw_qr_code(c, doc_id, margin, width):
    try:
        qr_code = qr.QrCodeWidget(doc_id)
        size = 60
        d = Drawing(size, size)
        d.add(qr_code)
        renderPDF.draw(d, c, width - margin - size, margin + 10)
    except Exception:
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(width - margin - 60, margin + 10, "(QR error)")

def render_document(title, body_text, issued_by, issued_at, doc_id, barangay):
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=LETTER)
    width, height = LETTER
    margin = inch

    # Border frame
    c.setLineWidth(2)
    c.rect(margin/2, margin/2, width - margin, height - margin)

    # Seals (left: Republic, right: Barangay)
    try:
        c.drawImage("backend/app/assets/seals/ph_seal.png",
                    margin, height - margin - 50,
                    width=60, height=60, preserveAspectRatio=True, mask='auto')
    except Exception:
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(margin, height - margin - 10, "(PH seal missing)")

    try:
        c.drawImage("backend/app/assets/seals/barangay_seal.png",
                    width - margin - 60, height - margin - 50,
                    width=60, height=60, preserveAspectRatio=True, mask='auto')
    except Exception:
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(width - margin - 50, height - margin - 10, "(Barangay seal missing)")

    # Header text centered between seals
    c.setFont("Times-Bold", 16)
    c.drawCentredString(width/2, height - margin - 10, "Republic of the Philippines")
    c.setFont("Times-Bold", 14)
    c.drawCentredString(width/2, height - margin - 35, f"Barangay {barangay}")
    c.setFont("Times-Bold", 18)
    c.drawCentredString(width/2, height - margin - 75, title)

    # Body text block
    text_obj = c.beginText(margin + 40, height - margin - 140)
    text_obj.setFont("Times-Roman", 12)
    text_obj.setLeading(18)

    # Calculate usable width (page width minus left/right margins)
    usable_width = width - 2 * margin
    # Estimate characters per line (roughly 6 points per character at 12pt font)
    chars_per_line = int(usable_width / 6)

    for paragraph in body_text.split("\n"):
        wrapped_lines = textwrap.wrap(paragraph, width=chars_per_line)
        for line in wrapped_lines:
            text_obj.textLine(line)
        text_obj.textLine("")  # add blank line between paragraphs

    c.drawText(text_obj)

    # Certification
    c.setFont("Times-Roman", 12)
    c.drawString(margin, margin + 100, "Certified by:")
    c.setFont("Times-Bold", 12)
    c.drawString(margin, margin + 80, issued_by)

    # Footer + QR
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(margin, margin, "This document is system-generated and valid without signature.")
    draw_qr_code(c, doc_id, margin, width)

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()

def generate_barangay_clearance_pdf(data, issued_by, issued_at, doc_id):
    resident = data.get("resident", {})

    full_name = safe_text(resident.get("fullName") or resident.get("full_name") or "Unnamed")

    # ✅ Use normalized location from prepare_generator_data
    location = data.get("location") or resident.get("address", {})
    # 🔧 Ensure location is a dict 
    if isinstance(location, str): 
        try: 
            location = json.loads(location) 
        except Exception: 
            logger.warning("Failed to parse location string: %s", location) 
            location = {} 
    elif not isinstance(location, dict): 
        location = {} 
        
    full_address, barangay = format_address(location)

    purpose = safe_text(data.get("purpose", "lawful purposes"))

    body = (
        f"This is to certify that {full_name}, of legal age, currently residing at {full_address}, "
        f"is of good moral character and has no derogatory record filed in this barangay.\n\n"
        f"This clearance is issued upon request for {purpose}. "
        f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.\n\n"
        f"Document ID: {doc_id}"
    )
    return render_document("BARANGAY CLEARANCE", body, issued_by, issued_at, doc_id, barangay)


def generate_residency_certificate_pdf(data, issued_by, issued_at, doc_id):
    resident = data.get("resident", {})
    full_name = safe_text(resident.get("fullName", "Unnamed"))
    full_address, barangay = format_address(resident.get("address", {}))
    years = safe_text(data.get("years_of_stay", ""))  # ✅ normalized

    body = (
        f"This is to certify that {full_name}, of legal age, is a bonafide resident of Barangay {barangay}, "
        f"currently residing at {full_address}.\n\n"
        + (f"Resident has lived in the barangay for {years} years.\n\n" if years else "")
        + f"This certificate is issued upon request for the purpose of establishing residency. "
        f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.\n\n"
        f"Document ID: {doc_id}"
    )
    return render_document("CERTIFICATE OF RESIDENCY", body, issued_by, issued_at, doc_id, barangay)


def generate_indigency_certificate_pdf(data, issued_by, issued_at, doc_id):
    resident = data.get("resident", {})
    full_name = safe_text(resident.get("fullName", "Unnamed"))
    full_address, barangay = format_address(resident.get("address", {}))
    remarks = safe_text(data.get("remarks", "financial assistance"))

    body = (
        f"This is to certify that {full_name}, of legal age, currently residing at {full_address}, "
        f"is recognized by Barangay {barangay} as a person of indigent status.\n\n"
        f"This certificate is issued upon request for the purpose of {remarks}. "
        f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.\n\n"
        f"Document ID: {doc_id}"
    )
    return render_document("CERTIFICATE OF INDIGENCY", body, issued_by, issued_at, doc_id, barangay)

def generate_good_moral_certificate_pdf(data, issued_by, issued_at, doc_id):
    resident = data.get("resident", {})
    full_name = safe_text(resident.get("fullName", "Unnamed"))
    full_address, barangay = format_address(resident.get("address", {}))
    purpose = safe_text(data.get("purpose", "school/employment"))

    body = (
        f"This is to certify that {full_name}, of legal age, residing at {full_address}, "
        f"is known to possess good moral character and has no record of misconduct in this barangay.\n\n"
        f"This certificate is issued upon request for {purpose}. "
        f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.\n\n"
        f"Document ID: {doc_id}"
    )
    return render_document("CERTIFICATE OF GOOD MORAL CHARACTER", body, issued_by, issued_at, doc_id, barangay)

def generate_business_clearance_pdf(data, issued_by, issued_at, doc_id):
    business_name = safe_text(data.get("business_name", "Unnamed Business"))
    resident = data.get("resident", {})
    owner = safe_text(resident.get("fullName", "Unnamed"))
    full_address, barangay = format_address(data.get("location", {}) or resident.get("address", {}))

    body = (
        f"This is to certify that the business named '{business_name}', owned by {owner}, "
        f"located at {full_address}, is duly recognized and permitted to operate within Barangay {barangay}.\n\n"
        f"This clearance is issued for registration, renewal, or legal compliance. "
        f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.\n\n"
        f"Document ID: {doc_id}"
    )
    return render_document("BARANGAY BUSINESS CLEARANCE", body, issued_by, issued_at, doc_id, barangay)

def generate_activity_permit_pdf(data, issued_by, issued_at, doc_id):
    resident = data.get("resident", {})
    organizer = safe_text(resident.get("fullName", "Unnamed"))
    activity_name = safe_text(data.get("activity_name", "Unnamed Activity"))
    location = data.get("location", {})
    full_address, barangay = format_address(location)

    # ✅ Ensure date is always valid
    raw_date = data.get("activity_date")
    date = parse_date(raw_date, issued_at) if raw_date else issued_at
    if date is None:
        date = issued_at

    body = (
        f"This is to certify that {organizer} is granted permission to conduct the activity titled "
        f"'{activity_name}', to be held at {full_address} on {date.strftime('%B %d, %Y')}.\n\n"
        f"This permit is issued in accordance with barangay regulations and public safety protocols. "
        f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.\n\n"
        f"Document ID: {doc_id}"
    )
    return render_document("PERMIT TO CONDUCT ACTIVITY", body, issued_by, issued_at, doc_id, barangay)

def generate_blotter_report_pdf(data, issued_by, issued_at, doc_id):
    complainant = safe_text(data.get("complainant", "Unnamed"))
    respondent = safe_text(data.get("respondent", "Unnamed"))
    incident = safe_text(data.get("incident", "No details"))
    location = data.get("location", {})
    full_address, barangay = format_address(location)
    date_reported = parse_date(data.get("date_reported"), issued_at)

    body = (
        f"This is to certify that a blotter report was filed by {complainant} against {respondent}, "
        f"regarding the following incident: {incident}.\n\n"
        f"The incident occurred at {full_address} and was reported on {date_reported.strftime('%B %d, %Y')}. "
        f"This report is recorded in the official barangay blotter log. "
        f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.\n\n"
        f"Document ID: {doc_id}"
    )
    return render_document("BLOTTER REPORT", body, issued_by, issued_at, doc_id, barangay)


def generate_health_certificate_pdf(data, issued_by, issued_at, doc_id):
    resident = data.get("resident", {})
    full_name = safe_text(resident.get("fullName", "Unnamed"))
    full_address, barangay = format_address(resident.get("address", {}))
    purpose = safe_text(data.get("health_purpose", "medical purposes"))  # ✅ normalized

    body = (
        f"This is to certify that {full_name}, residing at {full_address}, has undergone a medical check-up "
        f"and is found to be in good health condition.\n\n"
        f"This certificate is issued for the purpose of {purpose}. "
        f"Issued this {issued_at.strftime('%B %d, %Y')} at Barangay {barangay}.\n\n"
        f"Document ID: {doc_id}"
    )
    return render_document("HEALTH CERTIFICATE", body, issued_by, issued_at, doc_id, barangay)

def generate_barangay_id_pdf(data, issued_by, issued_at, doc_id):
    # Work at 4x scale for easier layout
    scale_factor = 4
    large_width = scale_factor * 3.375 * inch
    large_height = scale_factor * 2.125 * inch
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=(large_width, large_height))

    # --- Resident data ---
    resident = data.get("resident", {})
    full_name = safe_text(resident.get("fullName", "Unnamed"))
    birth_date = safe_text(resident.get("birthDate", "N/A"))
    civil_status = safe_text(resident.get("civilStatus", "N/A"))
    gender = safe_text(resident.get("gender", "N/A"))
    occupation = safe_text(data.get("occupation") or "N/A")
    voter_status = safe_text(data.get("voterStatus") or "N/A")
    photo_url = resident.get("photoUrl", "")
    address_dict = resident.get("address", {}) or {}
    barangay = safe_text(address_dict.get("barangay", "Unknown"))

    # --- Watermark ---
    try:
        c.saveState()
        c.setFillAlpha(0.15)
        c.drawImage("backend/app/assets/seals/barangay_seal.png",
                    large_width/2 - 2.4*inch, large_height/2 - 2.4*inch,
                    width=4.8*inch, height=4.8*inch,
                    preserveAspectRatio=True, mask='auto')
        c.restoreState()
    except Exception as e:
        logger.warning("Watermark render failed: %s", e)

    # --- Header ---
    try:
        c.drawImage("backend/app/assets/seals/ph_seal.png",
                    0.2*inch, large_height - 1.4*inch,
                    width=1.2*inch, height=1.2*inch, preserveAspectRatio=True, mask='auto')
    except Exception:
        c.setFont("Helvetica-Oblique", 20)
        c.drawString(0.2*inch, large_height - 1.0*inch, "(PH seal)")

    try:
        c.drawImage("backend/app/assets/seals/barangay_seal.png",
                    large_width - 1.4*inch, large_height - 1.4*inch,
                    width=1.2*inch, height=1.2*inch, preserveAspectRatio=True, mask='auto')
    except Exception:
        c.setFont("Helvetica-Oblique", 20)
        c.drawString(large_width - 1.4*inch, large_height - 1.0*inch, "(Barangay seal)")

    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(large_width/2, large_height - 0.8*inch, "Republic of the Philippines")
    c.drawCentredString(large_width/2, large_height - 1.3*inch, f"Barangay {barangay}")
    c.line(0.35*inch, large_height - 1.50*inch, large_width - 0.35*inch, large_height - 1.50*inch)

    # --- Gold banner ---
    banner_y = large_height - 2.2*inch
    banner_height = 0.6*inch
    c.setFillColorRGB(1.0, 0.84, 0.0)  # gold
    c.rect(0.35*inch, banner_y, large_width - 0.7*inch, banner_height, fill=True, stroke=False)
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(1)
    c.rect(0.35*inch, banner_y, large_width - 0.7*inch, banner_height, fill=False, stroke=True)
    c.setFillColorRGB(0, 0, 0)
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(large_width/2, banner_y + banner_height/2 - 10, "BARANGAY IDENTIFICATION CARD")

    # --- Barangay ID number ---
    id_y = large_height - 3.0*inch
    c.setFont("Helvetica-Bold", 18)
    c.setFillColorRGB(0, 0, 0)
    c.drawString(0.6*inch, id_y, f"ID #: {doc_id}")

    # --- Photo ---
    if photo_url:
        try:
            if photo_url.startswith("http"):
                img_data = urlopen(photo_url).read()
                img = ImageReader(BytesIO(img_data))
            elif photo_url.startswith("data:image"):
                encoded = photo_url.split(",", 1)[1]
                img_data = base64.b64decode(encoded)
                img = ImageReader(BytesIO(img_data))
            else:
                img = ImageReader(photo_url)

            c.drawImage(img, 0.6*inch, large_height - 6.0*inch,
                        width=2.4*inch, height=2.4*inch,
                        preserveAspectRatio=True, mask='auto')
        except Exception as e:
            logger.warning("Photo render failed: %s", e)
            c.setFont("Helvetica-Oblique", 20)
            c.drawString(0.6*inch, large_height - 3.6*inch, "(Photo unavailable)")

        # --- Signature area below photo ---
    signature_x = 0.6*inch
    signature_y = large_height - 6.8*inch   # adjust relative to photo bottom
    signature_width = 2.4*inch
    signature_height = 0.8*inch

    signature_url = resident.get("signatureUrl", None)
    if signature_url:
        try:
            if signature_url.startswith("http"):
                sig_data = urlopen(signature_url).read()
                sig_img = ImageReader(BytesIO(sig_data))
            elif signature_url.startswith("data:image"):
                encoded = signature_url.split(",", 1)[1]
                sig_data = base64.b64decode(encoded)
                sig_img = ImageReader(BytesIO(sig_data))
            else:
                sig_img = ImageReader(signature_url)

            # Draw signature image
            c.drawImage(sig_img, signature_x, signature_y,
                        width=signature_width, height=signature_height,
                        preserveAspectRatio=True, mask='auto')
        except Exception as e:
            logger.warning("Signature render failed: %s", e)

    # --- Always draw underline below signature area ---
    underline_y = signature_y - 0.1*inch
    c.setStrokeColorRGB(0, 0, 0)
    c.setLineWidth(1)
    c.line(signature_x, underline_y, signature_x + signature_width, underline_y)

    # --- Label below underline ---
    c.setFont("Helvetica", 14)
    c.setFillColorRGB(0, 0, 0)
    c.drawCentredString(signature_x + signature_width/2, underline_y - 0.3*inch, "Signature")

    # --- Details ---
    details_x = 4.0*inch
    fields = [
        ("Name:", full_name),
        ("Birth Date:", birth_date),
        ("Civil Status:", civil_status),
        ("Gender:", gender),
        ("Occupation:", occupation),
        ("Voter Status:", "Registered Voter" if voter_status.lower() == "yes" else voter_status),
    ]

        # --- Address split into 3 lines ---
    line1 = " ".join([address_dict.get("house_number", ""), address_dict.get("street", "")]).strip()
    line2_parts = []
    if address_dict.get("barangay"):
        line2_parts.append(f"Brgy. {address_dict['barangay']}")
    if address_dict.get("city"):
        line2_parts.append(address_dict["city"])
    line2 = ", ".join(line2_parts)

    line3_parts = []
    if address_dict.get("province"):
        line3_parts.append(address_dict["province"])
    if address_dict.get("zip_code"):
        line3_parts.append(address_dict["zip_code"])
    line3 = ", ".join(line3_parts)

    address_lines = [line1 or "N/A", line2 or "", line3 or ""]

    # Add each line of address as its own field
    fields.append(("Address:", address_lines[0]))
    for extra_line in address_lines[1:]:
        fields.append(("", extra_line))  # continuation lines

    # --- Layout for details ---
    start_y = banner_y - 1.0*inch
    bottom_margin = 0.5*inch
    available_height = start_y - bottom_margin
    line_height = available_height / len(fields)
    current_y = start_y

    for label, value in fields:
        if label:  # normal label/value pair
            c.setFont("Helvetica", 26)
            c.setFillColorRGB(0, 0, 0)  # black for labels
            c.drawString(details_x, current_y, label)
            label_width = c.stringWidth(label, "Helvetica", 26)
            c.setFont("Helvetica-Bold", 26)
            c.setFillColorRGB(0, 0, 1)  # blue for values
            c.drawString(details_x + label_width + 12, current_y, value)
        else:  # continuation line (no label, just value)
            c.setFont("Helvetica-Bold", 26)
            c.setFillColorRGB(0, 0, 1)  # blue for values
            c.drawString(details_x, current_y, value)
        current_y -= line_height

    # --- QR code (right side, scaled up) ---
    try:
        qr_code = qr.QrCodeWidget(doc_id)
        target_size = 3.0*inch
        bounds = qr_code.getBounds()
        width = bounds[2] - bounds[0]
        height = bounds[3] - bounds[1]
        scale_x = target_size / width
        scale_y = target_size / height
        d = Drawing(target_size, target_size, transform=[scale_x, 0, 0, scale_y, 0, 0])
        d.add(qr_code)
        qr_x = large_width - target_size - 0.6*inch
        qr_y = large_height - 6.0*inch
        renderPDF.draw(d, c, qr_x, qr_y)
    except Exception as e:
        logger.warning("QR render failed: %s", e)
        c.setFont("Helvetica-Oblique", 20)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(large_width - 2.0*inch, large_height - 3.6*inch, "(QR error)")

    # --- Validity under QR code ---
    valid_until = issued_at + timedelta(days=365)
    c.setFont("Helvetica-Bold", 20)
    c.setFillColorRGB(0, 0, 0)
    c.drawRightString(large_width - 0.6*inch, large_height - 7.4*inch,
                      f"Valid until: {valid_until.month} / {valid_until.day} / {valid_until.strftime('%y')}")

    # --- Scale down to ID size ---
    scale_x = (3.375 * inch) / large_width
    scale_y = (2.125 * inch) / large_height
    c.scale(scale_x, scale_y)

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer.read()
