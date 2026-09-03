import { useEffect, useCallback, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { resolveReceiptLogo, buildReceiptDoc } from "../../utils/receiptPdf";
import defaultLogo from "../../assets/barangay_logo.png";

const ReceiptPreview = ({ receiptData, onGeneratePDF }) => {
  const [logoSrc, setLogoSrc] = useState(defaultLogo);

  useEffect(() => {
    let cancelled = false;
    resolveReceiptLogo(receiptData?.barangayId).then((src) => {
      if (!cancelled) setLogoSrc(src);
    });
    return () => {
      cancelled = true;
    };
  }, [receiptData?.barangayId]);

  // Called directly from a button's onClick below — keep it a close
  // continuation of that click. Routing this through setState/effects/
  // timers first (as MyReceipts.jsx's list-row actions used to) makes
  // browsers stop treating the resulting window.open/save as a trusted
  // user gesture and silently block it.
  const printPDF = useCallback(async () => {
    if (!receiptData) return;
    const doc = await buildReceiptDoc(receiptData, logoSrc);
    doc.autoPrint();
    doc.output("dataurlnewwindow");
  }, [receiptData, logoSrc]);

  useEffect(() => {
    if (onGeneratePDF) {
      onGeneratePDF(() => printPDF);
    }
  }, [onGeneratePDF, printPDF]);

  if (!receiptData) return null;

  const getCleanAmount = (amount) => {
    const cleaned = String(amount || "0").replace(/[^\d.-]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };


  return (
    <div className="receipt-preview">
      <img src={logoSrc} alt="Barangay seal" className="receipt-logo" />
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
        <QRCodeCanvas value={`${window.location.origin}/verify/receipt/${receiptData.receiptNumber}`} size={150} />
        <p>Scan QR to verify receipt</p>
      </div>

      {/* Conditional footer line in preview */}
      <p className="footer-line">
        {receiptData.entityType === "document"
          ? `Issued by ${receiptData.barangay || "Barangay"} Secretary`
          : `Approved by ${receiptData.barangay || "Barangay"} Staff`}
      </p>

      <button type="button" onClick={printPDF}>🖨️ Print Receipt</button>
    </div>
  );
};

export default ReceiptPreview;
