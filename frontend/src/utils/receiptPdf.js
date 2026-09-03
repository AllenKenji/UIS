import jsPDF from "jspdf";
import QRCode from "qrcode";
import { api, API_BASE_URL, PublicServicesAPI } from "../services/api";
import defaultLogo from "../assets/barangay_logo.png";

// Backend-relative paths (e.g. "/storage/...") need the API host prefixed —
// same pattern as BarangayPortal's resolveImageUrl.
const resolveImageUrl = (url) => (url?.startsWith("/") ? `${API_BASE_URL}${url}` : url);

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

// Resolves the barangay's own logo as a same-origin-safe data URL (falling
// back to the bundled default seal), suitable for embedding in a PDF
// without a cross-origin canvas-taint risk — see buildReceiptDoc.
export const resolveReceiptLogo = async (barangayId) => {
  if (!barangayId) return defaultLogo;
  try {
    const tenant = await PublicServicesAPI.getTenant(barangayId);
    const url = tenant?.logoUrl ? resolveImageUrl(tenant.logoUrl) : null;
    if (!url) return defaultLogo;
    // Fetch the logo as bytes and embed it as a data URL instead of
    // pointing an <img> straight at the backend (a different origin than
    // the frontend) — jsPDF draws the logo onto a canvas to embed it in
    // the PDF, and a cross-origin image without matching CORS headers
    // taints that canvas, making the logo silently vanish with no error.
    const res = await api.get(url, { responseType: "blob" });
    return await blobToDataUrl(res.data);
  } catch {
    return defaultLogo;
  }
};

const getCleanAmount = (amount) => {
  const cleaned = String(amount || "0").replace(/[^\d.-]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

// Builds the receipt PDF and returns the jsPDF document (does not output or
// open it — callers decide, e.g. doc.output("dataurlnewwindow")). Callers
// should invoke this as directly as possible from a real click handler:
// window.open-based output only survives as a trusted popup when it's a
// close continuation of the user gesture, not routed through setState,
// effects, or timers first.
export const buildReceiptDoc = async (receiptData, logoSrc) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: [80, 200],
  });

  const margin = 5;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const lineHeight = 10;

  // Logo (the barangay's own, falling back to the default seal). logoSrc
  // is always same-origin (bundled asset) or a data: URL by this point —
  // never a raw cross-origin URL — so no canvas-taint risk here.
  let headerY = margin + 10;
  try {
    const img = new Image();
    const loaded = await new Promise((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = logoSrc;
    });
    if (loaded) doc.addImage(img, "PNG", margin, headerY - 6, 12, 12);
  } catch {
    console.warn("Logo not found, skipping image.");
  }

  // Header text
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  const headerText =
    receiptData.entityType === "document"
      ? "Barangay Document Payment Receipt"
      : "Barangay Business Payment Receipt";
  const headerLines = doc.splitTextToSize(headerText, pageWidth - (margin + 20));
  doc.text(headerLines, margin + 18, headerY);

  // Divider
  doc.setLineWidth(0.3);
  doc.line(margin, headerY + 8, pageWidth - margin, headerY + 8);

  // Details
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  let y = headerY + 16;
  const labelX = margin;

  const drawField = (label, value) => {
    doc.text(label, labelX, y);
    doc.text(value || "", labelX + doc.getTextWidth(label) + 2, y);
    y += lineHeight;
  };

  drawField("Receipt #:", receiptData.receiptNumber);
  drawField(
    receiptData.entityType === "document" ? "Document ID:" : "Business ID:",
    receiptData.customEntityId || receiptData.entityId
  );
  drawField("Resident:", receiptData.residentName);
  drawField("Type:", receiptData.description);
  drawField("Amount Paid:", "PHP " + getCleanAmount(receiptData.amount).toFixed(2));
  drawField("Payment Method:", receiptData.method);
  drawField("Date Issued:", new Date(receiptData.issuedAt).toLocaleString());
  drawField("Processed By:", receiptData.processedBy);

  // Footer
  y += lineHeight;
  doc.setFontSize(9);
  doc.text("This receipt serves as proof of payment.", pageWidth / 2, y, { align: "center" });
  y += lineHeight;
  doc.text("Thank you.", pageWidth / 2, y, { align: "center" });

  // Signature line centered
  y += lineHeight * 2;
  const lineWidth = 40;
  const lineX = (pageWidth - lineWidth) / 2;
  doc.line(lineX, y, lineX + lineWidth, y);
  doc.text("Authorized Signature", pageWidth / 2, y + 4, { align: "center" });

  // QR code
  const qrDataUrl = await QRCode.toDataURL(`${window.location.origin}/verify/receipt/${receiptData.receiptNumber}`);
  const qrSize = 25;
  doc.addImage(qrDataUrl, "PNG", pageWidth / 2 - qrSize / 2, pageHeight - qrSize - margin, qrSize, qrSize);

  return doc;
};
