import { useEffect, useState } from "react";
import { PaymentsAPI } from "../../services/api";
import ReceiptPreview from "./ReceiptPreview";
import { resolveReceiptLogo, buildReceiptDoc } from "../../utils/receiptPdf";
import "../../styles/staff/payment_form.css";
import "./my-receipts.css";

// Reprints a receipt from history — maps the stored receipt record's field
// names (payments/receipts collection shape, set in log_payment_record)
// onto the shape ReceiptPreview expects (which mirrors what PaymentForm
// builds right after recording a fresh payment).
const toReceiptData = (r) => ({
  receiptNumber: r.receiptNumber,
  residentName: r.ownerName || "Resident",
  amount: r.amount,
  method: r.method,
  processedBy: r.issuedBy,
  issuedAt: r.datePaid,
  entityType: r.entityType,
  entityId: r.businessId || r.documentId,
  customEntityId: r.businessId || r.documentId,
  description: r.entityCategory,
  barangayId: r.barangayId,
});

const MyReceipts = () => {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [printingId, setPrintingId] = useState(null);

  // Print directly from this click handler — no setState-then-mount-then-
  // effect indirection first. Once a window.open call is routed through
  // React state updates and effects, browsers stop treating it as a
  // trusted continuation of the click and silently block the popup.
  const handlePrint = async (r) => {
    setPrintingId(r.id);
    try {
      const logoSrc = await resolveReceiptLogo(r.barangayId);
      const doc = await buildReceiptDoc(toReceiptData(r), logoSrc);
      doc.autoPrint();
      doc.output("dataurlnewwindow");
    } catch (error) {
      console.error("Failed to generate receipt PDF:", error);
    } finally {
      setPrintingId(null);
    }
  };

  useEffect(() => {
    setLoading(true);
    PaymentsAPI.listMyReceipts()
      .then((data) => {
        const sorted = (Array.isArray(data) ? data : []).sort(
          (a, b) => new Date(b.datePaid || 0) - new Date(a.datePaid || 0)
        );
        setReceipts(sorted);
      })
      .catch((error) => console.error("Failed to load my receipts:", error))
      .finally(() => setLoading(false));
  }, []);

  const getCleanAmount = (amount) => {
    const cleaned = String(amount || "0").replace(/[^\d.-]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  // "To" is inclusive of the whole day, not just midnight.
  const fromBound = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
  const toBound = toDate ? new Date(`${toDate}T23:59:59.999`) : null;
  const filteredReceipts = receipts.filter((r) => {
    if (!fromBound && !toBound) return true;
    if (!r.datePaid) return false;
    const paidAt = new Date(r.datePaid);
    if (fromBound && paidAt < fromBound) return false;
    if (toBound && paidAt > toBound) return false;
    return true;
  });
  const hasDateFilter = Boolean(fromDate || toDate);

  if (viewing) {
    return (
      <div className="my-receipts">
        <button type="button" onClick={() => setViewing(null)}>← Back to My Receipts</button>
        <ReceiptPreview receiptData={toReceiptData(viewing)} onGeneratePDF={() => {}} />
      </div>
    );
  }

  return (
    <div className="my-receipts">
      <h2>🧾 My Issued Receipts</h2>
      <p className="my-receipts-note">Cash/manual payments you've personally recorded.</p>

      <div className="my-receipts-filter">
        <label>
          From
          <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
        </label>
        {hasDateFilter && (
          <button type="button" onClick={() => { setFromDate(""); setToDate(""); }}>Clear</button>
        )}
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : receipts.length === 0 ? (
        <p>You haven't issued any receipts yet.</p>
      ) : filteredReceipts.length === 0 ? (
        <p>No receipts issued in that date range.</p>
      ) : (
        <table className="my-receipts-table">
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>For</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredReceipts.map((r) => (
              <tr key={r.id}>
                <td>{r.receiptNumber}</td>
                <td>{r.ownerName || "—"}</td>
                <td>{r.entityType === "business" ? "🏢 Business" : "📄 Document"} — {r.entityCategory || "—"}</td>
                <td>₱{getCleanAmount(r.amount).toFixed(2)}</td>
                <td>{r.method || "—"}</td>
                <td>{r.datePaid ? new Date(r.datePaid).toLocaleString() : "—"}</td>
                <td className="my-receipts-actions">
                  <button type="button" onClick={() => setViewing(r)}>View</button>
                  <button type="button" disabled={printingId === r.id} onClick={() => handlePrint(r)}>
                    {printingId === r.id ? "Preparing…" : "🖨️ Print"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default MyReceipts;
