import React, { useEffect, useState } from "react";
import { api } from "../../services/api";

const RejectedRequests = () => {
  const [rejected, setRejected] = useState([]);

  useEffect(() => {
    const fetchRejected = async () => {
      try {
        const { data } = await api.get("/api/documents", { params: { status: "rejected" } });
        setRejected(data);
      } catch (err) {
        console.error("❌ Error fetching rejected requests:", err.message);
      }
    };
    fetchRejected();
  }, []);

  return (
    <div className="sidebar-section">
      <h3>❌ Rejected Requests</h3>
      {rejected.length === 0 ? (
        <p>No rejected requests.</p>
      ) : (
        <ul>
          {rejected.map(doc => (
            <li key={doc.id}>
              {doc.resident_name || doc.resident_id} — {doc.document_type}
              <span>Reason: {doc.rejection_reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RejectedRequests;
