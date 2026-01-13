import React, { useEffect, useState } from "react";
import { api } from "../../services/api";

const IssuedDocuments = () => {
  const [issued, setIssued] = useState([]);

  useEffect(() => {
    const fetchIssued = async () => {
      try {
        const { data } = await api.get("/api/documents", { params: { status: "approved" } });
        setIssued(data);
      } catch (err) {
        console.error("❌ Error fetching issued documents:", err.message);
      }
    };
    fetchIssued();
  }, []);

  return (
    <div className="sidebar-section">
      <h3>✅ Issued Documents</h3>
      {issued.length === 0 ? (
        <p>No issued documents.</p>
      ) : (
        <ul>
          {issued.map(doc => (
            <li key={doc.id}>
              {doc.resident_name || doc.resident_id} — {doc.document_type}
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer">📎 View</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default IssuedDocuments;
