import React, { useState, useEffect } from "react"; // ✅ add useEffect
import { api } from "../services/api";
import DocumentSummaryCards from "../components/document/DocumentSummaryCards";
import AuditTable from "../components/document/AuditTable";
import SearchFilters from "../components/document/SearchFilters";
import "../styles/dashboard/documents-admin.css";

const DocumentsAdmin = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  // 🔄 Fetch all documents with optional filters
  const fetchDocuments = async (filters = {}) => {
    setLoading(true);
    setStatus("Fetching all documents...");
    const cleanFilters = Object.fromEntries(
      Object.entries(filters).filter(([_, v]) => v !== "" && v !== null)
    );
    try {
      const { data } = await api.get("/api/documents", { params: cleanFilters });
      const normalized = data.map((doc) => ({ 
        ...doc, 
        residentName: doc.residentName || doc.residentId, 
      })); 
      setDocuments(normalized);
      setStatus("");
    } catch (err) {
      console.error("❌ Error fetching documents:", err);
      setStatus("❌ Failed to load documents.");
    } finally {
      setLoading(false);
    }
  };


  // ✅ Auto-fetch on mount with a slight delay to allow token refresh
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDocuments({});
    }, 5000); // short delay for token refresh
    return () => clearTimeout(timer);
  }, []);

  const handleDelete = async (docId) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      setStatus("Deleting document...");
      await api.delete(`/api/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setStatus("✅ Document deleted successfully.");
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message;
      console.error("❌ Error deleting document:", errorMsg);
      setStatus("❌ Failed to delete document.");
    }
  };

  return (
    <div className="documents-admin-page">
      <h1>📊 Document Oversight</h1>
      <DocumentSummaryCards role="admin" />
      <SearchFilters onSearch={fetchDocuments} />
      <h2>Recent Document Activity</h2>
      <AuditTable />
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
              <th>Document Type</th>
              <th>Resident</th>
              <th>Status</th>
              <th>Created At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                {/* Document Type */}
                <td>{doc.documentType}</td>

                {/* Resident */}
                <td>{doc.residentName}</td>

                {/* Status */}
                <td>{doc.status}</td>

                {/* Created At */}
                <td>
                  {doc.createdAt
                    ? new Date(doc.createdAt).toLocaleDateString()
                    : "N/A"}
                </td>

                {/* Actions */}
                <td>
                  <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                    📎 View
                  </a>{" "}
                  |{" "}
                  <button onClick={() => handleDelete(doc.id)}> ❌ Delete </button>
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
