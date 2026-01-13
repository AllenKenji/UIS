import React from "react";
import "../../styles/secretary/summary-cards.css";

const SummaryCards = ({ stats }) => {
  return (
    <div className="summary-cards">
      <div className="card">
        <h3>{stats.total}</h3>
        <p>Total Requests</p>
      </div>
      <div className="card">
        <h3>{stats.pending}</h3>
        <p>Pending</p>
      </div>
      <div className="card">
        <h3>{stats.awaiting_payment}</h3>
        <p>Awaiting Payment</p>
      </div>
      <div className="card">
        <h3>{stats.approved}</h3>
        <p>Approved</p>
      </div>
      <div className="card">
        <h3>{stats.rejected}</h3>
        <p>Rejected</p>
      </div>
    </div>
  );
};

export default SummaryCards;
