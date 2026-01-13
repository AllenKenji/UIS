import React, { useState } from "react";
import "../../styles/admin.css";

const RequestDocument = () => {
  const [docType, setDocType] = useState("Barangay Clearance");

  const handleRequest = () => {
    console.log(`Requested: ${docType}`);
    // TODO: Submit request to Firestore
  };

  return (
    <div className="request-document">
      <h3>📄 Request Document</h3>
      <select value={docType} onChange={(e) => setDocType(e.target.value)}>
        <option>Barangay Clearance</option>
        <option>Certificate of Indigency</option>
        <option>Certificate of Residency</option>
      </select>
      <button onClick={handleRequest}>Submit Request</button>
    </div>
  );
};

export default RequestDocument;
