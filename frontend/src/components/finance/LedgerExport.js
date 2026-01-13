import React from "react";
import "../../styles/admin.css";

const LedgerExport = () => {
  const handleExport = () => {
    console.log("Ledger export triggered");
    // TODO: Generate CSV or PDF
  };

  return (
    <div className="ledger-export">
      <h3>📁 Ledger Export</h3>
      <p>Download a copy of the barangay’s financial ledger for audit or backup.</p>
      <button onClick={handleExport}>Export Ledger</button>
    </div>
  );
};

export default LedgerExport;
