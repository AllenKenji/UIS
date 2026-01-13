import React, { useState } from "react";
import { api } from "../../services/api";
import { useEnrichedRequests } from "../../hooks/useEnrichedRequests";
import "../../styles/secretary/pending-requests.css";

const PendingRequests = () => {
  const { pending, loading, fetchPending } = useEnrichedRequests();
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const updateStatus = async (docId, newStatus, remarks = null) => {
    try {
      await api.patch(`/api/documents/${docId}/status`, { new_status: newStatus, remarks });
      setSelectedDoc(null);
      setRejectionReason(""); // reset after action
      fetchPending();
    } catch (err) {
      console.error("❌ Error updating document:", err.response?.data?.detail || err.message);
    }
  };

  return (
    <div className="pending-requests">
      <h3>📋 Pending Requests</h3>
      {loading && <p className="status-message">Updating…</p>}
      {pending.length === 0 ? (
        <p className="status-message">No pending requests.</p>
      ) : (
        <ul className="request-list">
          {pending.map((doc) => (
            <li key={doc.id} className="request-card">
              <div className="request-info">
                <strong>{doc.resident_name || doc.resident_id}</strong>
                <span>{doc.document_type}</span>
              </div>
              <button className="btn-view" onClick={() => setSelectedDoc(doc)}>👁️ View</button>
            </li>
          ))}
        </ul>
      )}

      {selectedDoc && (
        <div className="doc-panel">
          <header>
            <h4>{selectedDoc.resident_name || selectedDoc.resident_id}</h4>
            <p className="doc-type">{selectedDoc.document_type}</p>
          </header>

          <section className="doc-meta">
            <p><strong>Purpose:</strong> {selectedDoc.purpose || "—"}</p>
            <p><strong>Remarks:</strong> {selectedDoc.remarks || "—"}</p>
          </section>

          <section className="doc-attachments">
            <h5>Attachments</h5>
            {selectedDoc.attachments ? (
              <ul>
                {Object.entries(selectedDoc.attachments).map(([key, url]) => (
                  <li key={key}>
                    {key}: <a href={url} target="_blank" rel="noopener noreferrer">📎 View</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No attachments uploaded.</p>
            )}
          </section>

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
      )}
    </div>
  );
};

export default PendingRequests;
