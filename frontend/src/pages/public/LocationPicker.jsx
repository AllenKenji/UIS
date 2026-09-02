import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PublicServicesAPI } from "../../services/api";
import "../public-services.css";

export default function LocationPicker() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [city, setCity] = useState("");
  const [barangayId, setBarangayId] = useState("");

  useEffect(() => {
    PublicServicesAPI.listTenants()
      .then(setTenants)
      .catch(() => setError("Could not load the list of barangays. Please try again later."))
      .finally(() => setLoading(false));
  }, []);

  const cities = useMemo(
    () => [...new Set(tenants.map((t) => t.city))].sort(),
    [tenants]
  );
  const barangaysForCity = useMemo(
    () => tenants.filter((t) => t.city === city).sort((a, b) => a.barangay.localeCompare(b.barangay)),
    [tenants, city]
  );

  const handleContinue = (event) => {
    event.preventDefault();
    if (barangayId) navigate(`/b/${barangayId}`);
  };

  return (
    <main className="public-services">
      <section className="public-card">
        <h1>Welcome to the Barangay Information System</h1>
        <p>Select your city, then your barangay, to continue to its services portal.</p>
        {loading && <p className="public-note">Loading barangays...</p>}
        {error && <p className="public-error">{error}</p>}
        {!loading && !error && tenants.length === 0 && (
          <p className="public-note">No barangays have been registered on this system yet.</p>
        )}
        {!loading && tenants.length > 0 && (
          <form className="public-lookup" onSubmit={handleContinue}>
            <label>
              City
              <select value={city} onChange={(e) => { setCity(e.target.value); setBarangayId(""); }} required>
                <option value="">Select a city</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              Barangay
              <select value={barangayId} onChange={(e) => setBarangayId(e.target.value)} required disabled={!city}>
                <option value="">Select a barangay</option>
                {barangaysForCity.map((t) => <option key={t.id} value={t.id}>{t.barangay}</option>)}
              </select>
            </label>
            <button type="submit" disabled={!barangayId}>Continue</button>
          </form>
        )}
      </section>
    </main>
  );
}
