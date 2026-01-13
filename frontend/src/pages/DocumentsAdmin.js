import React, { useEffect, useState } from "react";
import { api } from "../services/api"; // ✅ shared Axios instance
import DocumentSummaryCards from "../components/document/DocumentSummaryCards"; // 📈 stats cards
import AuditTable from "../components/document/AuditTable"; // 📝 new component for logs
import SearchFilters from "../components/document/SearchFilters"; // 🔍 global filters
import "../styles/dashboard/documents-admin.css";

const DocumentsAdmin = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  // 🔄 Fetch all documents with optional filters
  const fetchDocuments = async (filters = {}) => {
        setLoading(true);
        setStatus("Fetching all documents...");
        try {
            const { data } = await api.get("/api/documents", { params: filters }); // ✅ fixed path
            setDocuments(data);
            setStatus("");
        } catch (err) {
            const errorMsg = err.response?.data?.detail || err.message;
            console.error("❌ Error fetching documents:", errorMsg);
            setStatus("❌ Failed to load documents.");
        } finally {
            setLoading(false);
        }
    };


  useEffect(() => {
    fetchDocuments();
  }, []);

  return (
    <div className="documents-admin-page">
      <h1>📊 Document Oversight</h1>

      {/* 📈 High-level stats */}
      <DocumentSummaryCards role="admin" />

      {/* 🔍 Global filters */}
      <SearchFilters onSearch={fetchDocuments} />

      {/* 📝 Audit log table */}
      <h2>Recent Document Activity</h2>
      <AuditTable />

      {/* 📁 Document list */}
      <h2>All Documents</h2>
      {status && <p className="status-message">{status}</p>}
      {loading ? (
        <p>Loading documents...</p>
      ) : documents.length === 0 ? (
        <p>No documents found.</p>
      ) : (
        <table className="document-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Resident</th>
              <th>Issued By</th>
              <th>Issued At</th>
              <th>Purpose</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.type}</td>
                <td>{doc.resident_name || doc.resident_id}</td>
                <td>{doc.issued_by}</td>
                <td>
                  {doc.issued_at
                    ? new Date(doc.issued_at).toLocaleDateString()
                    : "N/A"}
                </td>
                <td>{doc.purpose || "—"}</td>
                <td>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                    📎 View
                  </a>{" "}
                  |{" "}
                  <button onClick={() => console.log("Revoke", doc.id)}>
                    ❌ Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default DocumentsAdmin;
