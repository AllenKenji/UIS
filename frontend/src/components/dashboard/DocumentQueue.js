import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import { useUser } from "../../context/UserContext";
import "../../styles/dashboard/document-queue.css";

const DocumentQueue = () => {
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

        const snapshot = await getDocs(collection(db, "documents"));
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setRequests(data);
      } catch (err) {
        console.error("❌ Failed to load requests:", err);
        setError("Failed to load requests.");
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, [role]);

  const handleReview = (req) => setSelectedRequest(req);
  const closeModal = () => setSelectedRequest(null);

  // 🔧 Approve/Reject actions
  const updateStatus = async (newStatus) => {
    if (!selectedRequest) return;
    try {
      const ref = doc(db, "documents", selectedRequest.id);
      await updateDoc(ref, { status: newStatus });
      setRequests((prev) =>
        prev.map((r) =>
          r.id === selectedRequest.id ? { ...r, status: newStatus } : r
        )
      );
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
      <h3>📄 Document Requests</h3>
      {loading ? (
        <p>Loading requests…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : requests.length === 0 ? (
        <p>No requests available.</p>
      ) : (
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
                  <span className={`status-badge ${req.status?.toLowerCase()}`}>
                    {req.status}
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
                <p><strong>Resident:</strong> {selectedRequest.name}</p>
                <p><strong>Type:</strong> {selectedRequest.type}</p>
                <p><strong>Status:</strong> {selectedRequest.status}</p>
              </div>
              <footer className="modal-footer">
                <button
                  className="approve-btn"
                  onClick={() => updateStatus("Approved")}
                >
                  ✅ Approve
                </button>
                <button
                  className="reject-btn"
                  onClick={() => updateStatus("Rejected")}
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
