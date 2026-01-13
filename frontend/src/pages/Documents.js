import React, { useEffect, useState, useCallback } from "react";
import { api } from "../services/api"; // ✅ Use shared Axios instance
import DocumentForm from "../components/forms/DocumentForm";
import "./documents.css";

const Documents = () => {
  const [documents, setDocuments] = useState([]);
  const [residentId, setResidentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  // 🔄 Fetch documents for a resident
  const fetchDocuments = useCallback(async () => {
    if (!residentId.trim()) return;
    setLoading(true);
    setStatus("Fetching documents...");
    try {
      const { data } = await api.get("/documents", {
        params: { resident_id: residentId },
      });
      setDocuments(data);
      setStatus("");
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message;
      console.error("❌ Error fetching documents:", errorMsg);
      setStatus("❌ Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, [residentId]);

  // 🚀 Auto-fetch when residentId changes
  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // 📄 Render document item
  const renderDocumentItem = (doc) => {
    const issuedDate = doc.issued_at
      ? new Date(doc.issued_at).toLocaleDateString()
      : "N/A";
    const filename = `${doc.type.replace(/\s+/g, "_")}_${doc.id}.pdf`;

    return (
      <li key={doc.id} className="document-item">
        <strong>{doc.type}</strong> — {doc.purpose || "No purpose specified"}<br />
        Issued by: {doc.issued_by || "Barangay Admin"} on {issuedDate}<br />
        <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
          📎 View PDF
        </a>{" "}
        |{" "}
        <a href={doc.file_url} download={filename}>
          📥 Download
        </a>
      </li>
    );
  };

  return (
    <div className="documents-page">
      <h1>📄 Barangay Documents</h1>

      {/* 🔍 Resident Filter */}
      <div className="resident-filter">
        <label htmlFor="resident-id">Resident ID:</label>
        <input
          id="resident-id"
          type="text"
          value={residentId}
          onChange={(e) => setResidentId(e.target.value)}
          placeholder="Enter Resident ID"
        />
        <button onClick={fetchDocuments}>Search</button>
      </div>

      {/* 📝 Document Form */}
      <DocumentForm residentId={residentId} onDocumentCreated={fetchDocuments} />

      {/* 📁 Document List */}
      <h2>Generated Documents</h2>
      {status && <p className="status-message">{status}</p>}
      {loading ? (
        <p>Loading documents...</p>
      ) : documents.length === 0 ? (
        <p>No documents found.</p>
      ) : (
        <ul className="document-list">
          {documents.map(renderDocumentItem)}
        </ul>
      )}
    </div>
  );
};

export default Documents;
