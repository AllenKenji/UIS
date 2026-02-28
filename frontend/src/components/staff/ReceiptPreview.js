import { useEffect, useCallback } from "react";
import { QRCodeCanvas } from "qrcode.react";
import jsPDF from "jspdf";
import QRCode from "qrcode";
import logo from "../../assets/barangay_logo.png";

const ReceiptPreview = ({ receiptData, onGeneratePDF }) => {
  
  const generatePDF = useCallback(async () => {
    if (!receiptData) return;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [80, 200],
    });

    const margin = 5;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const lineHeight = 10;

    // Logo
    let headerY = margin + 10;
    try {
      const img = new Image();
      img.src = logo;
      await new Promise((resolve) => { img.onload = resolve; });
      doc.addImage(img, "PNG", margin, headerY - 6, 12, 12);
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
      receiptData.customEntityId || receiptData.entityId   // ✅ use custom ID if available
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
    const lineWidth = 40; // length of signature line
    const lineX = (pageWidth - lineWidth) / 2; // center horizontally
    doc.line(lineX, y, lineX + lineWidth, y);
    doc.text("Authorized Signature", pageWidth / 2, y + 4, { align: "center" });

    // QR code
    const qrDataUrl = await QRCode.toDataURL(JSON.stringify(receiptData));
    const qrSize = 25;
    doc.addImage(qrDataUrl, "PNG", pageWidth / 2 - qrSize / 2, pageHeight - qrSize - margin, qrSize, qrSize);

    // doc.save(`${receiptData.receiptNumber}.pdf`);
    doc.autoPrint(); 
    doc.output("dataurlnewwindow");
  }, [receiptData]);

  useEffect(() => {
    if (onGeneratePDF) {
      onGeneratePDF(() => generatePDF);
    }
  }, [onGeneratePDF, generatePDF]);

  if (!receiptData) return null;

  const getCleanAmount = (amount) => {
    const cleaned = String(amount || "0").replace(/[^\d.-]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };


  return (
    <div className="receipt-preview">
      <h3>✅ Receipt Preview</h3>
      <p><strong>Receipt #:</strong> {receiptData.receiptNumber}</p>
      {receiptData.entityType === "document" && (
        <p>
          <strong>Document ID:</strong> {receiptData.customEntityId || receiptData.entityId}
        </p>
      )}

      {receiptData.entityType === "business" && (
        <p>
          <strong>Business ID:</strong> {receiptData.entityId}
        </p>
      )}
      <p><strong>Type:</strong> {receiptData.description}</p>
      <p><strong>Amount:</strong> ₱{getCleanAmount(receiptData.amount).toFixed(2)}</p>
      <p><strong>Method:</strong> {receiptData.method}</p>
      <p><strong>Date:</strong> {new Date(receiptData.issuedAt).toLocaleString()}</p>
      <p><strong>Processed By:</strong> {receiptData.processedBy}</p>

      <div className="qr-preview">
        <QRCodeCanvas value={JSON.stringify(receiptData)} size={150} />
        <p>Scan QR to verify receipt</p>
      </div>

      {/* Conditional footer line in preview */}
      <p className="footer-line">
        {receiptData.entityType === "document"
          ? `Issued by ${receiptData.barangay || "Barangay"} Secretary`
          : `Approved by ${receiptData.barangay || "Barangay"} Staff`}
      </p>

      <button type="button" onClick={generatePDF}>Download PDF Receipt</button>
    </div>
  );
};

export default ReceiptPreview;
