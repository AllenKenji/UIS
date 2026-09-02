import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AccountsAPI, SuperAdminAPI } from "../../services/api";
import { useTenants } from "../../hooks/useTenants";
import "../../styles/fee-dashboard.css";

export default function AccountsPage() {
  const { tenants, cities } = useTenants();
  const [accounts, setAccounts] = useState([]);
  const [selectedBarangay, setSelectedBarangay] = useState("");
  const [accountsCityFilter, setAccountsCityFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshAccounts = useCallback(() => {
    setLoading(true);
    return SuperAdminAPI.listAccounts({
      ...(selectedBarangay ? { barangayId: selectedBarangay } : {}),
      ...(accountsCityFilter ? { city: accountsCityFilter } : {}),
    })
      .then(setAccounts)
      .catch((err) => setError(err.response?.data?.detail || "Failed to load accounts"))
      .finally(() => setLoading(false));
  }, [selectedBarangay, accountsCityFilter]);

  useEffect(() => { refreshAccounts(); }, [refreshAccounts]);

  const handleDeleteAccount = async (account) => {
    if (!window.confirm(`Delete the account for ${account.full_name || account.email}? This cannot be undone.`)) return;
    setError("");
    try {
      await AccountsAPI.delete(account.uid);
      refreshAccounts();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete account");
    }
  };

  return (
    <div className="fee-dashboard">
      <h1>👥 Accounts</h1>
      <div style={{ marginBottom: "10px" }}>
        <Link
          to="/accounts/new"
          style={{
            display: "inline-block",
            padding: "8px 14px",
            background: "#2563eb",
            color: "#fff",
            borderRadius: "4px",
            textDecoration: "none",
          }}
        >
          ➕ Create Account
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && <p className="loading">Loading...</p>}

      <div className="fee-section">
        <h2>
          Accounts {selectedBarangay ? `— ${tenants.find((t) => t.id === selectedBarangay)?.barangay || selectedBarangay}` : "(all barangays)"}
        </h2>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "10px", flexWrap: "wrap" }}>
          <label>
            Filter by city{" "}
            <select
              value={accountsCityFilter}
              onChange={(e) => {
                setAccountsCityFilter(e.target.value);
                setSelectedBarangay("");
              }}
            >
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Filter by barangay{" "}
            <select value={selectedBarangay} onChange={(e) => setSelectedBarangay(e.target.value)}>
              <option value="">All barangays</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.barangay} ({t.city})</option>
              ))}
            </select>
          </label>
          {(selectedBarangay || accountsCityFilter) && (
            <button
              onClick={() => {
                setSelectedBarangay("");
                setAccountsCityFilter("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        <table className="fee-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Role</th><th>Barangay</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.uid}>
                <td>{a.full_name}</td>
                <td>{a.email}</td>
                <td>{a.role}</td>
                <td>{tenants.find((t) => t.id === a.barangayId)?.barangay || a.barangayId || "—"}</td>
                <td>
                  {a.role === "super_admin" ? (
                    "—"
                  ) : (
                    <button onClick={() => handleDeleteAccount(a)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
