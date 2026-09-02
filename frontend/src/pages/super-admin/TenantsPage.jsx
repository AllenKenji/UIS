import { useMemo, useState } from "react";
import { SuperAdminAPI } from "../../services/api";
import { useTenants } from "../../hooks/useTenants";
import "../../styles/fee-dashboard.css";

const emptyContactForm = { province: "", zipCode: "", contactNumber: "", email: "", emergencyHotline: "", officeHours: "" };

export default function TenantsPage() {
  const { tenants, cities, loading, error: loadError, refresh } = useTenants();
  const [form, setForm] = useState({ city: "", province: "", barangay: "", zipCode: "" });
  const [editingTenantId, setEditingTenantId] = useState(null);
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [error, setError] = useState("");
  const [cityFilter, setCityFilter] = useState("");

  // Derived from the actual barangay records, not the cities collection, so
  // the filter always matches what's really filterable — even if a city was
  // logo-uploaded with no barangays yet, or vice versa.
  const tenantCities = useMemo(
    () => Array.from(new Set(tenants.map((t) => t.city).filter(Boolean))).sort(),
    [tenants]
  );
  const filteredTenants = useMemo(
    () => (cityFilter ? tenants.filter((t) => t.city === cityFilter) : tenants),
    [tenants, cityFilter]
  );

  const handleCreateTenant = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await SuperAdminAPI.createTenant(form);
      setForm({ city: "", province: "", barangay: "", zipCode: "" });
      refresh();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create barangay");
    }
  };

  const handleDeleteTenant = async (id) => {
    if (!window.confirm("Delete this barangay? This does not delete its residents/records.")) return;
    try {
      await SuperAdminAPI.deleteTenant(id);
      refresh();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete barangay");
    }
  };

  const handleTenantLogoChange = async (tenantId, file) => {
    if (!file) return;
    setError("");
    try {
      await SuperAdminAPI.uploadTenantLogo(tenantId, file);
      refresh();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to upload barangay logo");
    }
  };

  const handleCityLogoChange = async (cityId, file) => {
    if (!file) return;
    setError("");
    try {
      await SuperAdminAPI.uploadCityLogo(cityId, file);
      refresh();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to upload city logo");
    }
  };

  const handleDeleteCity = async (city) => {
    if (!window.confirm(`Delete ${city.name}? This only works if it has no barangays registered under it.`)) return;
    setError("");
    try {
      await SuperAdminAPI.deleteCity(city.id);
      refresh();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to delete city");
    }
  };

  const startEditingTenant = (tenant) => {
    setEditingTenantId(tenant.id);
    setContactForm({
      province: tenant.province || "",
      zipCode: tenant.zipCode || "",
      contactNumber: tenant.contactNumber || "",
      email: tenant.email || "",
      emergencyHotline: tenant.emergencyHotline || "",
      officeHours: tenant.officeHours || "",
    });
  };

  const cancelEditingTenant = () => {
    setEditingTenantId(null);
    setContactForm(emptyContactForm);
  };

  const handleSaveContactInfo = async (tenantId) => {
    setError("");
    try {
      await SuperAdminAPI.updateTenant(tenantId, contactForm);
      cancelEditingTenant();
      refresh();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to update barangay information");
    }
  };

  return (
    <div className="fee-dashboard">
      <h1>🛡️ Barangays &amp; Cities</h1>
      {(error || loadError) && <p className="error">{error || loadError}</p>}
      {loading && <p className="loading">Loading...</p>}

      <div className="fee-section">
        <h2>Add a Barangay</h2>
        <form onSubmit={handleCreateTenant} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label>City<br /><input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} required /></label>
          <label>Province<br /><input value={form.province} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} required /></label>
          <label>Barangay<br /><input value={form.barangay} onChange={(e) => setForm((f) => ({ ...f, barangay: e.target.value }))} required /></label>
          <label>Zip Code<br /><input value={form.zipCode} onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))} placeholder="e.g. 1700" /></label>
          <button type="submit">Add Barangay</button>
        </form>
      </div>

      <div className="fee-section">
        <h2>Cities ({cities.length})</h2>
        <table className="fee-table">
          <thead>
            <tr><th>Logo</th><th>City</th><th>Upload Logo</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {cities.map((c) => (
              <tr key={c.id}>
                <td>{c.logoUrl ? <img src={c.logoUrl} alt={c.name} style={{ width: 40, height: 40, objectFit: "contain" }} /> : "—"}</td>
                <td>{c.name}</td>
                <td><input type="file" accept="image/*" onChange={(e) => handleCityLogoChange(c.id, e.target.files?.[0])} /></td>
                <td><button onClick={() => handleDeleteCity(c)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fee-section">
        <h2>Barangays ({filteredTenants.length}{cityFilter ? ` of ${tenants.length}` : ""})</h2>
        <div style={{ marginBottom: "10px" }}>
          <label>
            Filter by city{" "}
            <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
              <option value="">All cities</option>
              {tenantCities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </label>
          {cityFilter && (
            <button type="button" onClick={() => setCityFilter("")} style={{ marginLeft: "8px" }}>
              Clear filter
            </button>
          )}
        </div>
        <table className="fee-table">
          <thead>
            <tr>
              <th>Logo</th><th>Barangay</th><th>City</th><th>Province</th><th>Zip Code</th>
              <th>Contact No.</th><th>Email</th><th>Emergency Hotline</th><th>Office Hours</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTenants.map((t) => (
              <tr key={t.id}>
                <td>
                  {t.logoUrl ? <img src={t.logoUrl} alt={t.barangay} style={{ width: 40, height: 40, objectFit: "contain" }} /> : "—"}
                  <br />
                  <input type="file" accept="image/*" onChange={(e) => handleTenantLogoChange(t.id, e.target.files?.[0])} />
                </td>
                <td>{t.barangay}</td>
                <td>{t.city}</td>
                <td>
                  {editingTenantId === t.id ? (
                    <input value={contactForm.province} onChange={(e) => setContactForm((f) => ({ ...f, province: e.target.value }))} />
                  ) : (
                    t.province
                  )}
                </td>
                <td>
                  {editingTenantId === t.id ? (
                    <input value={contactForm.zipCode} onChange={(e) => setContactForm((f) => ({ ...f, zipCode: e.target.value }))} placeholder="e.g. 1700" />
                  ) : (
                    t.zipCode || "—"
                  )}
                </td>
                <td>
                  {editingTenantId === t.id ? (
                    <input value={contactForm.contactNumber} onChange={(e) => setContactForm((f) => ({ ...f, contactNumber: e.target.value }))} placeholder="e.g. (02) 8123 4567" />
                  ) : (
                    t.contactNumber || "—"
                  )}
                </td>
                <td>
                  {editingTenantId === t.id ? (
                    <input value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="barangay@email.com" />
                  ) : (
                    t.email || "—"
                  )}
                </td>
                <td>
                  {editingTenantId === t.id ? (
                    <input value={contactForm.emergencyHotline} onChange={(e) => setContactForm((f) => ({ ...f, emergencyHotline: e.target.value }))} placeholder="e.g. 0917 123 4567" />
                  ) : (
                    t.emergencyHotline || "—"
                  )}
                </td>
                <td>
                  {editingTenantId === t.id ? (
                    <input value={contactForm.officeHours} onChange={(e) => setContactForm((f) => ({ ...f, officeHours: e.target.value }))} placeholder="Mon–Fri, 8AM–5PM" />
                  ) : (
                    t.officeHours || "—"
                  )}
                </td>
                <td>
                  {editingTenantId === t.id ? (
                    <>
                      <button onClick={() => handleSaveContactInfo(t.id)}>Save</button>
                      <button onClick={cancelEditingTenant}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => startEditingTenant(t)}>Edit Info</button>
                  )}
                  <button onClick={() => handleDeleteTenant(t.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
