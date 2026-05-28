import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, DocumentsAPI } from "../services/api";
import DocumentSummaryCards from "../components/document/DocumentSummaryCards";
import AuditTable from "../components/document/AuditTable";
import SearchFilters from "../components/document/SearchFilters";
import RequestModal from "../components/secretary/RequestModal";
import "../styles/dashboard/documents-admin.css";
import "../styles/secretary/pending-requests.css";
import "../styles/secretary/paid-requests.css";
import "../styles/secretary/issued-documents.css";

const DocumentsAdmin = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [issueRemarks, setIssueRemarks] = useState("");
  const navigate = useNavigate();

  const normalizeForModal = (doc) => ({
    ...doc,
    document_id: doc.documentId || doc.document_id || doc.id,
    resident_id: doc.residentId || doc.resident_id,
    resident_name: doc.residentName || doc.resident_name || doc.residentId,
    document_type: doc.documentType || doc.document_type,
    created_at: doc.createdAt || doc.created_at,
    updated_at: doc.updatedAt || doc.updated_at,
    extraFields: doc.extraFields || {},
    attachments: doc.attachments || {},
  });

  const closeModal = () => {
    setSelectedDoc(null);
    setRejectionReason("");
    setIssueRemarks("");
  };

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
      const detail = err.response?.data?.detail || err.message;
      console.error("❌ Error fetching documents:", detail);
      setStatus(`❌ Failed to load documents. ${detail || ""}`.trim());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments({});
  }, []);

  const handleDelete = async (docId) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    try {
      setStatus("Deleting document...");
      await api.delete(`/api/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setStatus("✅ Document deleted successfully.");
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message;
      console.error("❌ Error deleting document:", errorMsg);
      setStatus("❌ Failed to delete document.");
    }
  };

  const updateStatus = async (firestoreId, newStatus, remarks = null) => {
    try {
      setStatus("Updating status...");
      await DocumentsAPI.patchStatus(firestoreId, { newStatus, remarks });
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === firestoreId ? { ...doc, status: newStatus, remarks: remarks || doc.remarks } : doc
        )
      );
      setSelectedDoc((prev) =>
        prev && prev.id === firestoreId
          ? { ...prev, status: newStatus, remarks: remarks || prev.remarks }
          : prev
      );
      setStatus("✅ Status updated successfully.");
      setRefreshKey((prev) => prev + 1);
      fetchDocuments({});
      closeModal();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message;
      console.error("❌ Error updating status:", errorMsg);
      setStatus("❌ Failed to update status.");
    }
  };

  const issueDocument = async (firestoreId) => {
    try {
      await DocumentsAPI.issue(firestoreId, {
        issued_by: "System Admin",
        remarks: issueRemarks.trim() || undefined,
      });
      setStatus("✅ Document issued successfully.");
      setRefreshKey((prev) => prev + 1);
      fetchDocuments({});
      closeModal();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message;
      console.error("❌ Error issuing document:", errorMsg);
      setStatus("❌ Failed to issue document.");
    }
  };

  const verifyPayment = async (firestoreId) => {
    try {
      const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");
      await DocumentsAPI.patchStatus(firestoreId, {
        newStatus: "paid",
        remarks: `Payment verified by ${userInfo?.full_name || userInfo?.uid || "Admin"}`,
      });
      setStatus("✅ Payment verified successfully.");
      setRefreshKey((prev) => prev + 1);
      fetchDocuments({});
      closeModal();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message;
      console.error("❌ Error verifying payment:", errorMsg);
      setStatus("❌ Failed to verify payment.");
    }
  };

  const renderStatusModal = () => {
    if (!selectedDoc) return null;

    if (selectedDoc.status === "pending") {
      return (
        <RequestModal
          doc={selectedDoc}
          onClose={closeModal}
          onUpdateStatus={updateStatus}
        />
      );
    }

    if (selectedDoc.status === "payment_submitted" || selectedDoc.status === "paid" || selectedDoc.status === "for_payment") {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header>
              <h4>{selectedDoc.resident_name || selectedDoc.resident_id}</h4>
              <p className="doc-type">{selectedDoc.document_type}</p>
              <p className="doc-id">Document ID: {selectedDoc.document_id}</p>
              {selectedDoc.amount === 0 && (
                <p className="doc-free">This is a free document (no payment required).</p>
              )}
            </header>

            <section className="doc-meta">
              <p><strong>Purpose:</strong> {selectedDoc.purpose || "—"}</p>
              <p><strong>Remarks:</strong> {selectedDoc.remarks || "—"}</p>
              <p>
                <strong>Payment Ref:</strong>{" "}
                {selectedDoc.amount > 0
                  ? selectedDoc.transactionId || selectedDoc.paymentIntentId || "—"
                  : selectedDoc.referenceNumber || selectedDoc.transactionId || "—"}
              </p>
              <p><strong>Amount:</strong> {selectedDoc.amount === 0 ? "Free" : `₱${selectedDoc.amount}`}</p>
              <p><strong>Status:</strong> {selectedDoc.status}</p>
            </section>

            <section className="doc-actions">
              {selectedDoc.status === "payment_submitted" && (
                <button className="btn-verify" onClick={() => verifyPayment(selectedDoc.id)}>
                  🔍 Verify Payment
                </button>
              )}

              {(selectedDoc.status === "paid" || selectedDoc.amount === 0) && (
                <div className="reject-section">
                  <textarea
                    className="reject-textarea"
                    placeholder="Enter issuance remarks (optional)..."
                    value={issueRemarks}
                    onChange={(e) => setIssueRemarks(e.target.value)}
                  />
                  <button className="btn-approve" onClick={() => issueDocument(selectedDoc.id)}>
                    ✅ Issue Document
                  </button>
                </div>
              )}

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

              <button className="btn-close" onClick={closeModal}>⬅️ Close</button>
            </section>
          </div>
        </div>
      );
    }

    if (selectedDoc.status === "approved") {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header>
              <h4>{selectedDoc.resident_name || selectedDoc.resident_id}</h4>
              <p className="doc-type">{selectedDoc.document_type}</p>
              <p className="doc-id">Document ID: {selectedDoc.document_id}</p>
            </header>

            <section className="doc-meta">
              <p><strong>Purpose:</strong> {selectedDoc.purpose || "—"}</p>
              <p><strong>Issued By:</strong> {selectedDoc.issuedBy || "—"}</p>
              <p><strong>Issued At:</strong> {selectedDoc.issuedAt || "—"}</p>
              <p><strong>Remarks:</strong> {selectedDoc.remarks || "—"}</p>
              <p><strong>Status:</strong> {selectedDoc.status}</p>
            </section>

            <section className="doc-file">
              <h5>Issued File</h5>
              {selectedDoc.fileUrl ? (
                <a
                  href={selectedDoc.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-download"
                >
                  📄 Download Document
                </a>
              ) : (
                <p>No file uploaded yet.</p>
              )}
            </section>

            <button className="btn-close" onClick={closeModal}>⬅️ Close</button>
          </div>
        </div>
      );
    }

    if (selectedDoc.status === "rejected") {
      return (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header>
              <h4>{selectedDoc.resident_name || selectedDoc.resident_id}</h4>
              <p className="doc-type">{selectedDoc.document_type}</p>
              <p className="doc-id">Document ID: {selectedDoc.document_id}</p>
            </header>

            <section className="doc-meta">
              <p><strong>Purpose:</strong> {selectedDoc.purpose || "—"}</p>
              <p><strong>Status:</strong> {selectedDoc.status}</p>
              <p><strong>Rejection Reason:</strong> {selectedDoc.remarks || "No reason provided."}</p>
              <p><strong>Updated At:</strong> {selectedDoc.updatedAt || selectedDoc.updated_at || "—"}</p>
            </section>

            <button className="btn-close" onClick={closeModal}>⬅️ Close</button>
          </div>
        </div>
      );
    }

    return (
      <RequestModal
        doc={selectedDoc}
        onClose={closeModal}
        onUpdateStatus={updateStatus}
      />
    );
  };

  return (
    <div className="documents-admin-page">
      <div className="header-row">
        <h1>📊 Document Oversight</h1>
        <button className="issue-document-btn" onClick={() => navigate("/secretary/documents")}
        >
          ➕ Issue Document
        </button>
      </div>
      <DocumentSummaryCards key={refreshKey} role="admin" />
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
              <tr
                key={doc.id}
                onClick={() => setSelectedDoc(normalizeForModal(doc))}
                style={{ cursor: "pointer" }}
              >
                {/* Document Type */}
                <td>{doc.documentType}</td>

                {/* Resident */}
                <td>{doc.residentName}</td>

                {/* Status */}
                <td>{doc.status || "N/A"}</td>

                {/* Created At */}
                <td>
                  {doc.createdAt
                    ? new Date(doc.createdAt).toLocaleDateString()
                    : "N/A"}
                </td>

                {/* Actions */}
                <td>
                  {doc.status === "approved" && doc.fileUrl && (
                    <>
                      <a
                        href={doc.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        📎 View
                      </a>{" "}
                      |{" "}
                    </>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(doc.id);
                    }}
                  >
                    ❌ Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

      )}

      {renderStatusModal()}
    </div>
  );
};

export default DocumentsAdmin;
