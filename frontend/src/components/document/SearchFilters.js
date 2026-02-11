import React, { useState } from "react";
import "../../styles/dashboard/search-filters.css";

const SearchFilters = ({ onSearch }) => {
  const [documentType, setDocumentType] = useState("");
  const [issuedBy, setIssuedBy] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    // Build filters object only with non-empty values
    const filters = {};
    if (documentType) filters.documentType = documentType;
    if (issuedBy) filters.issuedBy = issuedBy;
    if (fromDate) filters.fromDate = fromDate;
    if (toDate) filters.toDate = toDate;

    onSearch(filters);
  };

  const handleReset = () => {
    setDocumentType("");
    setIssuedBy("");
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
        <label htmlFor="staff">Issued By:</label>
        <input
          id="staff"
          type="text"
          value={issuedBy}
          onChange={(e) => setIssuedBy(e.target.value)}
          placeholder="Staff/Secretary name"
        />
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
