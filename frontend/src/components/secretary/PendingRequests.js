import { useState } from "react";
import { DocumentsAPI } from "../../services/api";
import { useEnrichedRequests } from "../../hooks/useEnrichedRequests";
import RequestModal from "./RequestModal";
import "../../styles/secretary/pending-requests.css";

// 🔹 Main Component
const PendingRequests = () => {
  const { pending, loading, error, fetchRequests } = useEnrichedRequests();
  const [selectedDoc, setSelectedDoc] = useState(null);

  const updateStatus = async (firestoreId, newStatus, remarks = null) => {
    try {
      await DocumentsAPI.patchStatus(firestoreId, { newStatus, remarks });
      setSelectedDoc(null);
      fetchRequests();
    } catch (err) {
      console.error("❌ Error updating document:", err.message);
      alert("Failed to update status. Please try again.");
    }
  };

  return (
    <div className="pending-requests">
      <h3>📋 Requests to Verify</h3>
      {loading && <p className="status-message">Loading requests…</p>}
      {error && !loading && <p className="status-message">❌ {error}</p>}

      {pending.length === 0 && !loading && !error ? (
        <p className="status-message">No requests awaiting verification.</p>
      ) : (
        <ul className="request-list">
          {pending.map((doc) => (
            <li key={doc.id} className="request-card">
              <div className="request-info">
                <strong>{doc.residentName || doc.residentId}</strong>
                <span>{doc.documentType}</span>
                <small className="doc-id">({doc.documentId})</small>
              </div>
              <button className="btn-view" onClick={() => setSelectedDoc(doc)}>
                👁️ View
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedDoc && (
        <RequestModal
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onUpdateStatus={updateStatus}
        />
      )}
    </div>
  );
};

export default PendingRequests;
