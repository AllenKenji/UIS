import React, { useState } from "react";
import { useMyDocuments } from "../../hooks/useMyDocuments";
import { api } from "../../services/api";
import "../../styles/resident/my-documents.css";

const MyDocuments = ({ residentId }) => {
  const [tab, setTab] = useState("active");
  const { docs, loading } = useMyDocuments(residentId);

  const renderStatusBadge = (status) => (
    <span className={`status-badge status-${status}`}>{status}</span>
  );

  const handleResubmit = (docId) => {
    window.location.href = `/resubmit/${docId}`;
  };

  const handlePayment = async (docId) => {
    try {
        await api.patch(`/api/documents/${docId}/payment`);
        // Refresh the page or re-fetch docs
        window.location.reload();
    } catch (err) {
        console.error("❌ Error confirming payment:", err.response?.data?.detail || err.message);
        alert("Failed to confirm payment. Please try again.");
    }
    };

    const renderDocumentCard = (doc) => (
    <li key={doc.id} className="doc-card">
        <div className="doc-info">
        <strong>{doc.document_type}</strong>
        <span>Status: {renderStatusBadge(doc.status)}</span>
        <span>Purpose: {doc.purpose || "—"}</span>
        </div>

        {doc.remarks && <p className="doc-remarks">Remarks: {doc.remarks}</p>}

        {doc.status === "rejected" && tab === "needsAttention" && (
        <button
            className="btn-resubmit"
            onClick={() => handleResubmit(doc.id)}
        >
            🔄 Resubmit
        </button>
        )}

        {doc.status === "awaiting_payment" && tab === "active" && (
        <button
            className="btn-pay"
            onClick={() => handlePayment(doc.id)}
        >
            💳 Pay Now
        </button>
        )}
    </li>
    );


  const filterDocs = (statusGroup) => {
    if (statusGroup === "active") {
      return docs.filter((doc) =>
        ["pending", "awaiting_payment", "paid"].includes(doc.status)
      );
    }
    if (statusGroup === "needsAttention") {
      return docs.filter((doc) => doc.status === "rejected" && !doc.resubmitted);
    }
    if (statusGroup === "history") {
      return docs.filter((doc) =>
        doc.status === "approved" || (doc.status === "rejected" && doc.resubmitted)
      );
    }
    return docs;
  };

  const renderContent = (statusGroup) => {
    const filteredDocs = filterDocs(statusGroup);
    if (loading) return <p>Loading…</p>;
    if (filteredDocs.length === 0) return <p>No documents found.</p>;
    return <ul className="doc-list">{filteredDocs.map(renderDocumentCard)}</ul>;
  };

  return (
    <div className="my-documents">
      <h3>📄 My Documents</h3>

      <div className="tabs">
        <button
          onClick={() => setTab("active")}
          className={tab === "active" ? "active" : ""}
        >
          Active Requests
        </button>
        <button
          onClick={() => setTab("needsAttention")}
          className={tab === "needsAttention" ? "active" : ""}
        >
          Needs Attention
        </button>
        <button
          onClick={() => setTab("history")}
          className={tab === "history" ? "active" : ""}
        >
          History
        </button>
      </div>

      {renderContent(tab)}
    </div>
  );
};

export default MyDocuments;
