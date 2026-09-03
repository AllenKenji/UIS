import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PublicServicesAPI } from "../../services/api";
import "../public-services.css";

// Landing page the receipt QR code links to — confirms a payment is
// genuine without needing to hand over the full receipt record as raw
// JSON (which is what scanning it used to just dump on screen).
export default function VerifyReceipt() {
  const { receiptNumber } = useParams();
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    PublicServicesAPI.verifyReceipt(receiptNumber)
      .then(setReceipt)
      .catch((err) => setError(err.response?.data?.detail || "Could not verify this receipt."))
      .finally(() => setLoading(false));
  }, [receiptNumber]);

  const getCleanAmount = (amount) => {
    const cleaned = String(amount || "0").replace(/[^\d.-]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  return (
    <main className="public-services">
      <section className="public-card">
        {loading ? (
          <p>Checking receipt…</p>
        ) : error ? (
          <>
            <h1>❌ Not Verified</h1>
            <p className="public-error">{error}</p>
            <p className="public-note">Receipt #: {receiptNumber}</p>
          </>
        ) : (
          <>
            <h1>✅ Verified Receipt</h1>
            <div className="public-profile-details">
              <p><strong>Receipt #:</strong> {receipt.receiptNumber}</p>
              <p><strong>For:</strong> {receipt.businessName || receipt.ownerName || "—"}</p>
              <p><strong>Type:</strong> {receipt.entityType === "business" ? "Business" : "Document"} — {receipt.entityCategory || "—"}</p>
              <p><strong>Amount Paid:</strong> ₱{getCleanAmount(receipt.amount).toFixed(2)}</p>
              <p><strong>Method:</strong> {receipt.method || "—"}</p>
              <p><strong>Barangay:</strong> {receipt.barangay || "—"}</p>
              {receipt.datePaid && (
                <p><strong>Date Paid:</strong> {new Date(receipt.datePaid).toLocaleString()}</p>
              )}
              <p><strong>Issued By:</strong> {receipt.issuedBy || "—"}</p>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
