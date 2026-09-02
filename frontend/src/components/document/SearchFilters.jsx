import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import "../../styles/dashboard/search-filters.css";

const SearchFilters = ({ onSearch }) => {
  const [documentType, setDocumentType] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [residents, setResidents] = useState([]);

  useEffect(() => {
    let active = true;

    const fetchResidents = async () => {
      try {
        const { data } = await api.get("/api/residents");
        const list = Array.isArray(data) ? data : [];
        const normalized = list
          .map((resident) => ({
            id: resident.id,
            fullName: resident.fullName || resident.full_name || "",
          }))
          .filter((resident) => resident.id && resident.fullName)
          .sort((a, b) => a.fullName.localeCompare(b.fullName));

        if (active) {
          setResidents(normalized);
        }
      } catch (err) {
        console.error("❌ Failed to load residents for document filters:", err?.message || err);
        if (active) {
          setResidents([]);
        }
      }
    };

    fetchResidents();
    return () => {
      active = false;
    };
  }, []);

  const residentOptions = useMemo(() => {
    const prefix = issuedTo.trim().toLowerCase();
    if (!prefix) return residents.slice(0, 100);
    return residents
      .filter((resident) => resident.fullName.toLowerCase().startsWith(prefix))
      .slice(0, 100);
  }, [residents, issuedTo]);

  const handleSubmit = (e) => {
    e.preventDefault();

    // Build filters object only with non-empty values
    const filters = {};
    if (documentType) filters.documentType = documentType;
    if (issuedTo) {
      filters.issuedTo = issuedTo;

      const selectedResident = residents.find(
        (resident) => resident.fullName.toLowerCase() === issuedTo.trim().toLowerCase()
      );
      if (selectedResident) {
        filters.residentId = selectedResident.id;
      }
    }
    if (fromDate) filters.fromDate = fromDate;
    if (toDate) filters.toDate = toDate;

    onSearch(filters);
  };

  const handleReset = () => {
    setDocumentType("");
    setIssuedTo("");
    setFromDate("");
    setToDate("");
    onSearch({});
  };

  return (
    <form className="search-filters" onSubmit={handleSubmit}>
      <h3>🔍 Filter Documents</h3>

      <div className="filter-row">
        <label htmlFor="type">Type:</label>
        <select
          id="type"
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
        >
          <option value="">All</option>
          <option value="Resident Certificate">Residency</option>
          <option value="Barangay Clearance">Clearance</option>
          <option value="Indigency Certificate">Indigency</option>
          <option value="Good Moral Certificate">Good Moral</option>
          <option value="Business Clearance">Business Clearance</option>
          <option value="Activity Permit">Activity Permit</option>
          <option value="Blotter Report">Blotter Report</option>
          <option value="Health Certificate">Health Certificate</option>
          <option value="Barangay ID">Barangay ID</option>
        </select>
      </div>

      <div className="filter-row">
        <label htmlFor="issued-to">Issued To:</label>
        <input
          id="issued-to"
          type="text"
          list="resident-issued-to-options"
          value={issuedTo}
          onChange={(e) => setIssuedTo(e.target.value)}
          placeholder="Type resident name"
        />
        <datalist id="resident-issued-to-options">
          {residentOptions.map((resident) => (
            <option key={resident.id} value={resident.fullName} />
          ))}
        </datalist>
      </div>

      <div className="filter-row">
        <label htmlFor="from-date">From:</label>
        <input
          id="from-date"
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
      </div>

      <div className="filter-row">
        <label htmlFor="to-date">To:</label>
        <input
          id="to-date"
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
      </div>

      <div className="filter-actions">
        <button type="submit">Apply Filters</button>
        <button type="button" onClick={handleReset} className="reset-btn">
          Reset
        </button>
      </div>
    </form>
  );
};

export default SearchFilters;
