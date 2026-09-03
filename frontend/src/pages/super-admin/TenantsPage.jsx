import { useEffect, useMemo, useState, useCallback } from "react";
import { SuperAdminAPI } from "../../services/api";
import { useTenants } from "../../hooks/useTenants";
import "../../styles/fee-dashboard.css";

const emptyContactForm = { zipCode: "", contactNumber: "", email: "", emergencyHotline: "", officeHours: "" };

export default function TenantsPage() {
  const { tenants, cities, loading, error: loadError, refresh } = useTenants();
  const [provinces, setProvinces] = useState([]);
  const [provincesError, setProvincesError] = useState("");
  const [provinceForm, setProvinceForm] = useState({ name: "" });
  const [editingProvinceId, setEditingProvinceId] = useState(null);
  const [provinceNameDraft, setProvinceNameDraft] = useState("");
  const [cityForm, setCityForm] = useState({ name: "", province: "" });
  const [form, setForm] = useState({ city: "", barangay: "", zipCode: "" });
  const [editingTenantId, setEditingTenantId] = useState(null);
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [editingCityId, setEditingCityId] = useState(null);
  const [cityNameDraft, setCityNameDraft] = useState("");
  const [cityProvinceDraft, setCityProvinceDraft] = useState("");
  const [error, setError] = useState("");
  const [cityFilter, setCityFilter] = useState("");

  const refreshProvinces = useCallback(() => {
    SuperAdminAPI.listProvinces()
      .then(setProvinces)
      .catch((err) => setProvincesError(err.response?.data?.detail || "Failed to load provinces"));
  }, []);

  useEffect(refreshProvinces, [refreshProvinces]);

  // The barangay form no longer lets province be typed — it's locked to
  // whichever province the selected city was registered under.
  const selectedCityProvince = cities.find((c) => c.name === form.city)?.province || "";

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

  const handleCreateProvince = async (event) => {
    event.preventDefault();
    setProvincesError("");
    try {
      await SuperAdminAPI.createProvince(provinceForm);
      setProvinceForm({ name: "" });
      refreshProvinces();
    } catch (err) {
      setProvincesError(err.response?.data?.detail || "Failed to create province");
    }
  };

  const startEditingProvince = (province) => {
    setEditingProvinceId(province.id);
    setProvinceNameDraft(province.name);
  };

  const cancelEditingProvince = () => {
    setEditingProvinceId(null);
    setProvinceNameDraft("");
  };

  const handleRenameProvince = async (provinceId) => {
    setProvincesError("");
    try {
      await SuperAdminAPI.updateProvince(provinceId, { name: provinceNameDraft });
      cancelEditingProvince();
      refreshProvinces();
      refresh(); // city/tenant province strings may have cascaded
    } catch (err) {
      setProvincesError(err.response?.data?.detail || "Failed to rename province");
    }
  };

  const handleDeleteProvince = async (province) => {
    if (!window.confirm(`Delete ${province.name}? This only works if it has no cities registered under it.`)) return;
    setProvincesError("");
    try {
      await SuperAdminAPI.deleteProvince(province.id);
      refreshProvinces();
    } catch (err) {
      setProvincesError(err.response?.data?.detail || "Failed to delete province");
    }
  };

  const handleCreateCity = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await SuperAdminAPI.createCity(cityForm);
      setCityForm({ name: "", province: "" });
      refresh();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to create city");
    }
  };

  const startEditingCity = (city) => {
    setEditingCityId(city.id);
    setCityNameDraft(city.name);
    setCityProvinceDraft(city.province || "");
  };

  const cancelEditingCity = () => {
    setEditingCityId(null);
    setCityNameDraft("");
    setCityProvinceDraft("");
  };

  const handleRenameCity = async (cityId) => {
    setError("");
    try {
      await SuperAdminAPI.updateCity(cityId, { name: cityNameDraft, province: cityProvinceDraft || undefined });
      cancelEditingCity();
      refresh();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to rename city");
    }
  };

  const handleCreateTenant = async (event) => {
    event.preventDefault();
    setError("");
    try {
      // province isn't a form field anymore — it's locked to the selected
      // city's own registered province, not typed by hand.
      await SuperAdminAPI.createTenant({ ...form, province: selectedCityProvince });
      setForm({ city: "", barangay: "", zipCode: "" });
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
      <h1>🛡️ Provinces, Cities &amp; Barangays</h1>
      {(error || loadError) && <p className="error">{error || loadError}</p>}
      {provincesError && <p className="error">{provincesError}</p>}
      {loading && <p className="loading">Loading...</p>}

      <div className="fee-section">
        <h2>Add a Province</h2>
        <form onSubmit={handleCreateProvince} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label>Province Name<br /><input value={provinceForm.name} onChange={(e) => setProvinceForm({ name: e.target.value })} required /></label>
          <button type="submit">Add Province</button>
        </form>
      </div>

      <div className="fee-section">
        <h2>Provinces ({provinces.length})</h2>
        <table className="fee-table">
          <thead>
            <tr><th>Province</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {provinces.length === 0 ? (
              <tr><td colSpan={2}>No provinces registered yet.</td></tr>
            ) : (
              provinces.map((p) => (
                <tr key={p.id}>
                  <td>
                    {editingProvinceId === p.id ? (
                      <input value={provinceNameDraft} onChange={(e) => setProvinceNameDraft(e.target.value)} />
                    ) : (
                      p.name
                    )}
                  </td>
                  <td>
                    {editingProvinceId === p.id ? (
                      <>
                        <button onClick={() => handleRenameProvince(p.id)}>Save</button>
                        <button onClick={cancelEditingProvince}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => startEditingProvince(p)}>Edit</button>
                    )}
                    <button onClick={() => handleDeleteProvince(p)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="fee-section">
        <h2>Add a City</h2>
        <form onSubmit={handleCreateCity} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label>City Name<br /><input value={cityForm.name} onChange={(e) => setCityForm((f) => ({ ...f, name: e.target.value }))} required /></label>
          <label>
            Province<br />
            <select value={cityForm.province} onChange={(e) => setCityForm((f) => ({ ...f, province: e.target.value }))} required>
              <option value="">-- Select a registered province --</option>
              {provinces.map((p) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={provinces.length === 0}>Add City</button>
        </form>
        {provinces.length === 0 && <p className="status-message">Add a province above first.</p>}
      </div>

      <div className="fee-section">
        <h2>Cities ({cities.length})</h2>
        <table className="fee-table">
          <thead>
            <tr><th>Logo</th><th>City</th><th>Province</th><th>Upload Logo</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {cities.map((c) => (
              <tr key={c.id}>
                <td>{c.logoUrl ? <img src={c.logoUrl} alt={c.name} style={{ width: 40, height: 40, objectFit: "contain" }} /> : "—"}</td>
                <td>
                  {editingCityId === c.id ? (
                    <input value={cityNameDraft} onChange={(e) => setCityNameDraft(e.target.value)} />
                  ) : (
                    c.name
                  )}
                </td>
                <td>
                  {editingCityId === c.id ? (
                    <select value={cityProvinceDraft} onChange={(e) => setCityProvinceDraft(e.target.value)}>
                      <option value="">-- Select a registered province --</option>
                      {provinces.map((p) => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  ) : (
                    c.province || "—"
                  )}
                </td>
                <td><input type="file" accept="image/*" onChange={(e) => handleCityLogoChange(c.id, e.target.files?.[0])} /></td>
                <td>
                  {editingCityId === c.id ? (
                    <>
                      <button onClick={() => handleRenameCity(c.id)}>Save</button>
                      <button onClick={cancelEditingCity}>Cancel</button>
                    </>
                  ) : (
                    <button onClick={() => startEditingCity(c)}>Edit</button>
                  )}
                  <button onClick={() => handleDeleteCity(c)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fee-section">
        <h2>Add a Barangay</h2>
        <form onSubmit={handleCreateTenant} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          <label>
            City<br />
            <select value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} required>
              <option value="">-- Select a registered city --</option>
              {cities.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>Province<br /><input value={selectedCityProvince} readOnly placeholder="Auto-filled from City" /></label>
          <label>Barangay<br /><input value={form.barangay} onChange={(e) => setForm((f) => ({ ...f, barangay: e.target.value }))} required /></label>
          <label>Zip Code<br /><input value={form.zipCode} onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))} placeholder="e.g. 1700" /></label>
          <button type="submit" disabled={cities.length === 0}>Add Barangay</button>
        </form>
        {cities.length === 0 && <p className="status-message">Add a city above first.</p>}
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
                {/* Derived from the barangay's city, not directly editable here
                    — rename the province (or reassign the city, once that's
                    supported) to change it. */}
                <td>{t.province || "—"}</td>
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
