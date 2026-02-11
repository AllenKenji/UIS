import React, { useState } from "react";
import { DocumentsAPI } from "../../services/api";   // ✅ use centralized API
import { useEnrichedRequests } from "../../hooks/useEnrichedRequests";
import "../../styles/secretary/pending-requests.css";

const PendingRequests = () => {
  const { pending, loading, fetchRequests } = useEnrichedRequests();
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const updateStatus = async (firestoreId, newStatus, remarks = null) => {
    try {
      await DocumentsAPI.patchStatus(firestoreId, { newStatus: newStatus, remarks });
      setSelectedDoc(null);
      setRejectionReason("");
      fetchRequests();
    } catch (err) {
      console.error("❌ Error updating document:", err.message);
    }
  };

  return (
    <div className="pending-requests">
      <h3>📋 Requests to Verify</h3>
      {loading && <p className="status-message">Updating…</p>}
      {pending.length === 0 ? (
        <p className="status-message">No requests awaiting verification.</p>
      ) : (
        <ul className="request-list">
          {pending.map((doc) => (
            <li key={doc.id} className="request-card">
              <div className="request-info">
                <strong>{doc.resident_name || doc.resident_id}</strong>
                <span>{doc.document_type}</span>
                <small className="doc-id">({doc.document_id})</small>
              </div>
              <button className="btn-view" onClick={() => setSelectedDoc(doc)}>👁️ View</button>
            </li>
          ))}
        </ul>
      )}

      {selectedDoc && (
        <div className="modal-overlay" onClick={() => setSelectedDoc(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header>
              <h4>{selectedDoc.resident_name || selectedDoc.resident_id}</h4>
              <p className="doc-type">{selectedDoc.document_type}</p>
              <p className="doc-id">Document ID: {selectedDoc.document_id}</p>
            </header>

            <section className="doc-actions">
              <button
                className="btn-awaiting"
                onClick={() => updateStatus(selectedDoc.id, "awaiting_payment")}
              >
                💳 Awaiting Payment
              </button>

              <div className="reject-section">
                <textarea
                  className="reject-textarea"
                  placeholder="Enter rejection reason..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                />
                <button
                  className="btn-reject"
                  onClick={() => {
                    if (!rejectionReason.trim()) {
                      alert("Rejection reason is required.");
                      return;
                    }
                    updateStatus(selectedDoc.id, "rejected", rejectionReason.trim());
                  }}
                >
                  ❌ Reject
                </button>
              </div>

              <button className="btn-close" onClick={() => setSelectedDoc(null)}>⬅️ Close</button>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

export default PendingRequests;
