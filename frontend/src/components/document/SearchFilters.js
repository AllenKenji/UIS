import React, { useState } from "react";
import "../../styles/dashboard/search-filters.css";

const SearchFilters = ({ onSearch }) => {
  const [type, setType] = useState("");
  const [staff, setStaff] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch({
      type,
      staff,
      from_date: fromDate,
      to_date: toDate,
    });
  };

  const handleReset = () => {
    setType("");
    setStaff("");
    setFromDate("");
    setToDate("");
    onSearch({});
  };

  return (
    <form className="search-filters" onSubmit={handleSubmit}>
      <h3>🔍 Filter Documents</h3>

      <div className="filter-row">
        <label htmlFor="type">Type:</label>
        <select id="type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All</option>
          <option value="certificate">Certificate</option>
          <option value="permit">Permit</option>
          <option value="clearance">Clearance</option>
          <option value="affidavit">Affidavit</option>
        </select>
      </div>

      <div className="filter-row">
        <label htmlFor="staff">Issued By:</label>
        <input
          id="staff"
          type="text"
          value={staff}
          onChange={(e) => setStaff(e.target.value)}
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
