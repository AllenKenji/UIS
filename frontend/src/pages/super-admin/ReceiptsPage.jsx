import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { SuperAdminAPI } from "../../services/api";
import { useTenants } from "../../hooks/useTenants";
import "../../styles/fee-dashboard.css";

const peso = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReceiptsPage() {
  const { tenants, cities } = useTenants();
  const [cityFilter, setCityFilter] = useState("");
  const [barangayFilter, setBarangayFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [receipts, setReceipts] = useState([]);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  const loadReceipts = () => {
    SuperAdminAPI.listReceipts({
      ...(barangayFilter ? { barangayId: barangayFilter } : {}),
      ...(cityFilter ? { city: cityFilter } : {}),
      ...(fromDate ? { fromDate } : {}),
      // Send "to" as end-of-day so that day's own receipts aren't excluded —
      // a bare date parses to midnight, matching only 00:00:00 records.
      ...(toDate ? { toDate: `${toDate}T23:59:59` } : {}),
    })
      .then(setReceipts)
      .catch((err) => setError(err.response?.data?.detail || "Failed to load receipts"));
  };

  useEffect(loadReceipts, [cityFilter, barangayFilter, fromDate, toDate]);

  const handleDelete = async (receipt) => {
    const label = receipt.receiptNumber || receipt.id;
    if (!window.confirm(`Delete receipt ${label}? This cannot be undone.`)) return;

    setDeletingId(receipt.id);
    try {
      const result = await SuperAdminAPI.deleteReceipt(receipt.id);
      const linkedCount = result?.deletedPaymentIds?.length || 0;
      toast.success(
        linkedCount > 0
          ? `✅ Receipt ${label} deleted (${linkedCount} linked payment record${linkedCount === 1 ? "" : "s"} removed)`
          : `✅ Receipt ${label} deleted (no linked payment record was found)`
      );
      setReceipts((prev) => prev.filter((r) => r.id !== receipt.id));
    } catch (err) {
      toast.error(err.response?.data?.detail || "❌ Failed to delete receipt");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fee-dashboard">
      <h1>🧾 Receipts</h1>
      {error && <p className="error">{error}</p>}

      <div className="fee-section">
        <label>
          Filter by city{" "}
          <select value={cityFilter} onChange={(e) => { setCityFilter(e.target.value); setBarangayFilter(""); }}>
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          {" "}Filter by barangay{" "}
          <select value={barangayFilter} onChange={(e) => setBarangayFilter(e.target.value)}>
            <option value="">All barangays</option>
            {tenants
              .filter((t) => !cityFilter || t.city === cityFilter)
              .map((t) => (
                <option key={t.id} value={t.id}>{t.barangay}</option>
              ))}
          </select>
        </label>

        <div className="date-filter-row">
          <label>
            From{" "}
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} max={toDate || undefined} />
          </label>
          <label>
            To{" "}
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} min={fromDate || undefined} />
          </label>
          {(fromDate || toDate) && (
            <button onClick={() => { setFromDate(""); setToDate(""); }}>Clear dates</button>
          )}
        </div>

        <table className="fee-table">
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Date</th>
              <th>Barangay</th>
              <th>Type</th>
              <th>Owner/Business</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Issued By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 ? (
              <tr><td colSpan={9}>No receipts found.</td></tr>
            ) : (
              receipts.map((r) => (
                <tr key={r.id}>
                  <td>{r.receiptNumber || "—"}</td>
                  <td>{r.datePaid ? new Date(r.datePaid).toLocaleString() : "—"}</td>
                  <td>{tenants.find((t) => t.id === r.barangayId)?.barangay || r.barangayId || "—"}</td>
                  <td>{r.entityCategory || r.feeType || "—"}</td>
                  <td>{r.businessName || r.ownerName || "—"}</td>
                  <td>{peso(r.amount)}</td>
                  <td>{r.method || "—"}</td>
                  <td>{r.issuedBy || "—"}</td>
                  <td>
                    <button
                      className="danger-btn"
                      disabled={deletingId === r.id}
                      onClick={() => handleDelete(r)}
                    >
                      {deletingId === r.id ? "Deleting…" : "🗑️ Delete"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
