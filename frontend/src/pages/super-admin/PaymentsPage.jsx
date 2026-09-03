import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { SuperAdminAPI } from "../../services/api";
import { useTenants } from "../../hooks/useTenants";
import "../../styles/fee-dashboard.css";

const peso = (value) =>
  `₱${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PaymentsPage() {
  const { tenants, cities } = useTenants();
  const [paymentsSummary, setPaymentsSummary] = useState([]);
  const [paymentsCityFilter, setPaymentsCityFilter] = useState("");
  const [paymentsBarangayFilter, setPaymentsBarangayFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    SuperAdminAPI.paymentsSummary(paymentsCityFilter ? { city: paymentsCityFilter } : {})
      .then(setPaymentsSummary)
      .catch((err) => setError(err.response?.data?.detail || "Failed to load payment collections"));
  }, [paymentsCityFilter]);

  useEffect(() => {
    SuperAdminAPI.listPayments({
      ...(paymentsBarangayFilter ? { barangayId: paymentsBarangayFilter } : {}),
      ...(paymentsCityFilter ? { city: paymentsCityFilter } : {}),
      // Send the "to" date as end-of-day so that day's own payments aren't
      // excluded — a bare date parses to midnight, which would otherwise
      // only match records paid at exactly 00:00:00.
      ...(fromDate ? { fromDate } : {}),
      ...(toDate ? { toDate: `${toDate}T23:59:59` } : {}),
    })
      .then(setPayments)
      .catch((err) => setError(err.response?.data?.detail || "Failed to load payments"));
  }, [paymentsCityFilter, paymentsBarangayFilter, fromDate, toDate]);

  const handleDelete = async (payment) => {
    const label = payment.referenceNumber || payment.id;
    if (!window.confirm(`Delete payment record ${label}? This also deletes its receipt, if any, and cannot be undone.`)) return;

    setDeletingId(payment.id);
    try {
      const result = await SuperAdminAPI.deletePayment(payment.id);
      const linkedCount = result?.deletedReceiptIds?.length || 0;
      toast.success(
        linkedCount > 0
          ? `✅ Payment ${label} deleted (${linkedCount} linked receipt${linkedCount === 1 ? "" : "s"} removed)`
          : `✅ Payment ${label} deleted (no linked receipt was found)`
      );
      setPayments((prev) => prev.filter((p) => p.id !== payment.id));
    } catch (err) {
      toast.error(err.response?.data?.detail || "❌ Failed to delete payment");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fee-dashboard">
      <h1>💰 Payment Collections</h1>
      {error && <p className="error">{error}</p>}

      <div className="fee-section">
        <label>
          Filter by city{" "}
          <select value={paymentsCityFilter} onChange={(e) => { setPaymentsCityFilter(e.target.value); setPaymentsBarangayFilter(""); }}>
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </label>
        <h3>Totals per Barangay (paid only)</h3>
        <table className="fee-table">
          <thead>
            <tr><th>Barangay</th><th>City</th><th>Total Collected</th><th># Payments</th></tr>
          </thead>
          <tbody>
            {paymentsSummary.length === 0 ? (
              <tr><td colSpan={4}>No collections recorded yet.</td></tr>
            ) : (
              paymentsSummary.map((s) => (
                <tr key={s.barangayId || "unknown"}>
                  <td>
                    <button onClick={() => setPaymentsBarangayFilter(s.barangayId)}>
                      {s.barangay || s.barangayId || "Unassigned"}
                    </button>
                  </td>
                  <td>{s.city || "—"}</td>
                  <td>{peso(s.totalCollected)}</td>
                  <td>{s.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <h3>
          Payment Records {paymentsBarangayFilter ? `— ${tenants.find((t) => t.id === paymentsBarangayFilter)?.barangay || paymentsBarangayFilter}` : ""}
        </h3>
        {paymentsBarangayFilter && <button onClick={() => setPaymentsBarangayFilter("")}>Show all barangays</button>}

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
            <tr><th>Date</th><th>Barangay</th><th>Type</th><th>Reference</th><th>Amount</th><th>Status</th><th>Method</th><th></th></tr>
          </thead>
          <tbody>
            {payments.length === 0 ? (
              <tr><td colSpan={8}>No payment records found.</td></tr>
            ) : (
              payments.map((p) => (
                <tr key={p.id}>
                  <td>{p.datePaid ? new Date(p.datePaid).toLocaleString() : "—"}</td>
                  <td>{tenants.find((t) => t.id === p.barangayId)?.barangay || p.barangayId || "—"}</td>
                  <td>{p.entityCategory || p.feeType || "—"}</td>
                  <td>{p.referenceNumber || "—"}</td>
                  <td>{peso(p.amount)}</td>
                  <td>{p.status}</td>
                  <td>{p.method || "—"}</td>
                  <td>
                    <button
                      className="danger-btn"
                      disabled={deletingId === p.id}
                      onClick={() => handleDelete(p)}
                    >
                      {deletingId === p.id ? "Deleting…" : "🗑️ Delete"}
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
