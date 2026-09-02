import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { DocumentsAPI } from "../../services/api";
import { useUser } from "../../context/UserContext";
import "../../styles/dashboard/document-queue.css";

const normalizeStatus = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

const isPendingTransactionStatus = (value) => {
  const status = normalizeStatus(value);
  return ["for_payment", "awaiting_payment", "unpaid", "payment_submitted", "pending"].includes(status);
};

const normalizeRequest = (docId, data = {}) => {
  const normalizedStatus = normalizeStatus(data.paymentStatus || data.status || data.documentStatus);
  return {
    id: docId,
    ...data,
    status: normalizedStatus || "pending",
    residentName:
      data.residentName ||
      data.resident_name ||
      data.fullName ||
      data.residentId ||
      data.resident_id ||
      "—",
    documentType: data.documentType || data.document_type || data.type || "—",
  };
};

const toStatusLabel = (value) =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

const DocumentQueue = ({ statusFilter = "pending", title = "📄 Pending Document Requests" }) => {
  const { role } = useUser();
  const [requests, setRequests] = useState([]);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // 🔍 Fetch requests
  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const allowedRoles = ["admin", "secretary", "staff"];
        if (!allowedRoles.includes(role)) {
          setRequests([]);
          setLoading(false);
          return;
        }

        const response = await DocumentsAPI.list();
        const data = (Array.isArray(response) ? response : response?.items || [])
          .map((item) => normalizeRequest(item.documentId || item.id, item));
        const filtered =
          statusFilter === "all"
            ? data
            : statusFilter === "pending_transactions"
              ? data.filter((request) => isPendingTransactionStatus(request.status))
            : data.filter((request) => normalizeStatus(request.status) === normalizeStatus(statusFilter));
        setRequests(filtered);
      } catch (err) {
        console.error("❌ Failed to load requests:", err);
        setError("Failed to load requests.");
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, [role, statusFilter]);

  const handleReview = (req) => setSelectedRequest(req);
  const closeModal = () => setSelectedRequest(null);

  // 🔧 Approve/Reject actions
  const updateStatus = async (newStatus) => {
    if (!selectedRequest) return;
    try {
      const normalizedStatus = normalizeStatus(newStatus);
      await DocumentsAPI.patchStatus(selectedRequest.id, { newStatus: normalizedStatus });
      setRequests((prev) => {
        const updated = prev.map((r) =>
          r.id === selectedRequest.id ? { ...r, status: normalizedStatus } : r
        );
        if (statusFilter === "all") return updated;
        if (statusFilter === "pending_transactions") {
          return updated.filter((r) => isPendingTransactionStatus(r.status));
        }
        return updated.filter((r) => normalizeStatus(r.status) === normalizeStatus(statusFilter));
      });
      closeModal();
    } catch (err) {
      console.error("❌ Failed to update status:", err);
      alert("Failed to update request.");
    }
  };

  return (
    <div
      className={`document-queue ${selectedRequest ? "blurred" : ""}`}
      aria-busy={loading}
      aria-live="polite"
    >
      <h3>{title} ({requests.length})</h3>
      {loading ? (
        <p>Loading requests…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : requests.length === 0 ? (
        <p>No pending requests available.</p>
      ) : (
        <div className="queue-table-wrap">
          <table className="queue-table" aria-label="Document Requests Table">
            <thead>
              <tr>
                <th>Resident</th>
                <th>Type</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id}>
                  <td>{req.residentName}</td>
                  <td>{req.documentType}</td>
                  <td>
                    <span className={`status-badge ${normalizeStatus(req.status).replace(/_/g, "-")} ${normalizeStatus(req.status)}`}>
                      {toStatusLabel(req.status)}
                    </span>
                  </td>
                  <td>
                    <button
                      className="review-btn"
                      onClick={() => handleReview(req)}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Portal for modal */}
      {selectedRequest &&
        ReactDOM.createPortal(
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <header className="modal-header">
                <h4>Review Request</h4>
                <button className="close-btn" onClick={closeModal}>✖</button>
              </header>
              <div className="modal-body">
                <p><strong>Resident:</strong> {selectedRequest.residentName}</p>
                <p><strong>Type:</strong> {selectedRequest.documentType}</p>
                <p><strong>Status:</strong> {toStatusLabel(selectedRequest.status)}</p>
              </div>
              <footer className="modal-footer">
                <button
                  className="approve-btn"
                  onClick={() => updateStatus("approved")}
                >
                  ✅ Approve
                </button>
                <button
                  className="reject-btn"
                  onClick={() => updateStatus("rejected")}
                >
                  ❌ Reject
                </button>
              </footer>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default DocumentQueue;
