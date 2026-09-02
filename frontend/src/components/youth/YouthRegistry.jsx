import { useMemo, useState } from "react";
import "../../styles/sk.css";

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const computeAgeFromBirthDate = (resident) => {
  const birthDate = toDate(resident.birthDate || resident.dateOfBirth || resident.dob);
  if (!birthDate) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const getDisplayAge = (resident) => {
  if (typeof resident._computedAge === "number") return resident._computedAge;
  if (typeof resident.age === "number") return resident.age;
  if (typeof resident.age === "string") {
    const parsed = Number.parseInt(resident.age, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return computeAgeFromBirthDate(resident);
};

const toAgeLabel = (resident) => {
  const age = getDisplayAge(resident);
  if (typeof age === "number" && Number.isFinite(age) && age >= 0) {
    return String(age);
  }
  return "N/A";
};

const getBarangayLabel = (resident) => {
  const value = resident.address?.barangay || resident.barangay;
  if (typeof value !== "string") return "Unspecified";
  const trimmed = value.trim();
  return trimmed || "Unspecified";
};

const YouthRegistry = ({ residents = [], loading = false }) => {
  const [selectedBarangay, setSelectedBarangay] = useState("all");

  const barangayOptions = useMemo(() => {
    return Array.from(new Set(residents.map((resident) => getBarangayLabel(resident)))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [residents]);

  const filteredResidents = useMemo(() => {
    if (selectedBarangay === "all") return residents;
    return residents.filter((resident) => getBarangayLabel(resident) === selectedBarangay);
  }, [residents, selectedBarangay]);

  const isFilterDisabled = loading || residents.length === 0;

  return (
    <div className="youth-registry">
      <div className="youth-registry-filters">
        <label htmlFor="youth-registry-barangay">Barangay</label>
        <select
          id="youth-registry-barangay"
          value={selectedBarangay}
          onChange={(event) => setSelectedBarangay(event.target.value)}
          disabled={isFilterDisabled}
        >
          <option value="all">All Barangays</option>
          {barangayOptions.map((barangay) => (
            <option key={barangay} value={barangay}>
              {barangay}
            </option>
          ))}
        </select>
        <p className="youth-registry-meta">
          Showing {filteredResidents.length} of {residents.length}
        </p>
      </div>

      {loading ? (
        <p className="sk-empty-state">Loading youth registry...</p>
      ) : residents.length === 0 ? (
        <p className="sk-empty-state">No youth residents found yet.</p>
      ) : filteredResidents.length === 0 ? (
        <p className="sk-empty-state">No youth residents found for the selected barangay.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Age</th>
              <th>Barangay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredResidents.map((resident) => (
              <tr key={resident.id || resident.uid}>
                <td>{resident.fullName || resident.name || "Unnamed"}</td>
                <td>
                  <span className="sk-age-value">{toAgeLabel(resident)}</span>
                </td>
                <td>{getBarangayLabel(resident)}</td>
                <td>{resident.status || "Active"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default YouthRegistry;
