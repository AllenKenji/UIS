import { useState } from "react";
import { DocumentsAPI } from "../../services/api";   
import { useEnrichedRequests } from "../../hooks/useEnrichedRequests";
import "../../styles/secretary/paid-requests.css";

const PaidRequests = () => {
  const { toVerify, readyToIssue, loading, fetchRequests } = useEnrichedRequests();
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [issueRemarks, setIssueRemarks] = useState("");

  const userInfo = JSON.parse(sessionStorage.getItem("userInfo") || "{}");

  const issueDocument = async (firestoreId) => {
    try {
      await DocumentsAPI.issue(firestoreId, {
        issued_by: userInfo?.full_name || userInfo?.uid || "Unknown User",
        issuedByUid: userInfo?.uid,
        remarks: issueRemarks.trim() || undefined,
      });
      setSelectedDoc(null);
      setIssueRemarks("");
      fetchRequests();
    } catch (err) {
      console.error("❌ Error issuing document:", err.message);
    }
  };

  const verifyPayment = async (firestoreId) => {
    try {
      await DocumentsAPI.patchStatus(firestoreId, {
        newStatus: "paid",
        remarks: `Payment verified by ${userInfo?.full_name}`,
      });
      setSelectedDoc(null);
      setIssueRemarks("");
      fetchRequests();
    } catch (err) {
      console.error("❌ Error verifying payment:", err.message);
    }
  };

  const rejectDocument = async (firestoreId, reason) => {
    try {
      await DocumentsAPI.patchStatus(firestoreId, {
        newStatus: "rejected",
        remarks: reason,
      });
      setSelectedDoc(null);
      setRejectionReason("");
      setIssueRemarks("");
      fetchRequests();
    } catch (err) {
      console.error("❌ Error rejecting document:", err.message);
    }
  };

  return (
    <div className="paid-requests">
      {loading && <p className="status-message">Loading…</p>}

      {/* Section 1: Awaiting Verification */}
      <h3>💳 Requests Awaiting Verification</h3>
      {toVerify.length === 0 ? (
        <p className="status-message">No requests awaiting verification.</p>
      ) : (
        <ul className="request-list">
          {toVerify.map((doc) => (
            <li key={doc.id} className="request-card">
              <div className="request-info">
                <strong>{doc.resident_name || doc.resident_id}</strong>
                <span>{doc.document_type}</span>
                <small className="doc-id">({doc.document_id})</small>
                <span className="badge-pending">Payment Submitted</span>
              </div>
              <button className="btn-view" onClick={() => setSelectedDoc(doc)}>👁️ View</button>
            </li>
          ))}
        </ul>
      )}

      {/* Section 2: Ready to Issue */}
      <h3>📜 Ready to Issue</h3>
      {readyToIssue.length === 0 ? (
        <p className="status-message">No documents ready to issue.</p>
      ) : (
        <ul className="request-list">
          {readyToIssue.map((doc) => (
            <li key={doc.id} className="request-card">
              <div className="request-info">
                <strong>{doc.resident_name || doc.resident_id}</strong>
                <span>{doc.document_type}</span>
                <small className="doc-id">({doc.document_id})</small>
                {doc.amount === 0 ? (
                  <span className="badge-free">No Payment Required</span>
                ) : (
                  <span className="badge-paid">Payment Verified</span>
                )}
              </div>
              <button className="btn-view" onClick={() => setSelectedDoc(doc)}>👁️ View</button>
            </li>
          ))}
        </ul>
      )}

      {/* Modal */}
      {selectedDoc && (
        <div className="modal-overlay" onClick={() => { setSelectedDoc(null); setIssueRemarks(""); }}>
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
                    rejectDocument(selectedDoc.id, rejectionReason.trim());
                  }}
                >
                  ❌ Reject
                </button>
              </div>

              <button className="btn-close" onClick={() => { setSelectedDoc(null); setIssueRemarks(""); }}>⬅️ Close</button>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaidRequests;
