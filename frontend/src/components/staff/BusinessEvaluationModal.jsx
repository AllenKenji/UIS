import { useState } from "react";
import { toast } from "react-toastify";
import { QRCodeCanvas } from "qrcode.react";
import { API_BASE_URL, BusinessesAPI } from "../../services/api";
import "./business-eval-modal.css";

// Documents are stored server-side under snake_case keys (valid_id,
// proof_of_address, dti_cert, business_logo — see BusinessDocuments in
// backend/app/models/business.py), and their url is a backend-relative
// path (e.g. "/storage/...") that needs the API host prefixed, same as
// resident photos elsewhere (see PublicServicesAccess's resolveFileUrl).
const resolveDocumentUrl = (documents, key) => {
  const value = documents?.[key];
  if (!value) return null;
  const url = typeof value === "string" ? value : value?.url;
  if (!url) return null;
  return url.startsWith("/") ? `${API_BASE_URL}${url}` : url;
};

const BusinessEvaluationModal = ({ business, onClose, onUpdated, onSubmit }) => {
  const rawStatus = String(business.status || "").toLowerCase();
  const paymentStatus = String(business.paymentStatus || "").toLowerCase();
  // Terminal states take priority over payment status — otherwise a
  // business that's both approved and paid (the normal end state) gets
  // stuck showing "paid" forever and never reaches the approved view
  // below with its permit number and QR code. Matches the same priority
  // ResidentBusinessDashboard.jsx already uses.
  const effectiveStatus = ["approved", "expired", "rejected"].includes(rawStatus)
    ? rawStatus
    : (paymentStatus === "paid" || paymentStatus === "succeeded")
      ? "paid"
      : (rawStatus || "pending_evaluation");
  const isApproved = effectiveStatus === "approved";
  const isExpired = effectiveStatus === "expired";
  const [status, setStatus] = useState(
    ["payment_submitted", "paid"].includes(effectiveStatus) ? "approved" : effectiveStatus
  );
  const [notes, setNotes] = useState(business.notes || "");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (typeof onSubmit === "function") {
        await onSubmit({ status, notes });
        toast.success("✅ Status updated!");
        return;
      }

      await BusinessesAPI.update(business.id, {
        status,
        notes,
        evaluatedAt: new Date().toISOString(),
      });
      toast.success("✅ Status updated!");
      if (onUpdated) onUpdated();
      onClose();
    } catch (err) {
      console.error("❌ Error updating status:", err);
      toast.error("❌ Failed to update status.");
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <h2>Evaluate Business Application</h2>

        <div className="modal-section">
          <p><strong>Business Name:</strong> {business.businessName}</p>
          {business.isFranchise && <p><strong>Franchise/Branch:</strong> Yes</p>}
          <p><strong>Owner:</strong> {business.ownerName}</p>
          <p><strong>Type:</strong> {business.businessType}</p>
          <p><strong>Barangay:</strong> {business.barangay}</p>
          <p><strong>Address:</strong> {business.address}</p>
          <p><strong>Contact:</strong> {business.contactNumber}</p>
          <p><strong>Submitted:</strong> {business.registrationDate}</p>
        </div>

        <div className="modal-section">
          <h4>Submitted Documents</h4>
          {resolveDocumentUrl(business.documents, "valid_id") && (
            <p>
              <a href={resolveDocumentUrl(business.documents, "valid_id")} target="_blank" rel="noopener noreferrer">
                📄 View Valid ID
              </a>
            </p>
          )}
          {resolveDocumentUrl(business.documents, "proof_of_address") && (
            <p>
              <a href={resolveDocumentUrl(business.documents, "proof_of_address")} target="_blank" rel="noopener noreferrer">
                📄 View Proof of Address
              </a>
            </p>
          )}
          {resolveDocumentUrl(business.documents, "dti_cert") && (
            <p>
              <a href={resolveDocumentUrl(business.documents, "dti_cert")} target="_blank" rel="noopener noreferrer">
                📄 View DTI Certificate
              </a>
            </p>
          )}
          {resolveDocumentUrl(business.documents, "business_logo") && (
            <p>
              <a href={resolveDocumentUrl(business.documents, "business_logo")} target="_blank" rel="noopener noreferrer">
                🖼️ View Business Logo
              </a>
            </p>
          )}
        </div>

        {isApproved || isExpired ? (
          <div className="approved-section">
            <p><strong>Status:</strong> {isExpired ? "⛔ Expired — awaiting resident renewal payment" : "✅ Approved"}</p>
            <p><strong>Permit Number:</strong> {business.permitNumber || "—"}</p>
            {business.validUntil && (
              <p><strong>{isExpired ? "Expired On:" : "Valid Until:"}</strong> {new Date(business.validUntil).toLocaleDateString()}</p>
            )}
            {isApproved && (
              <div className="qr-wrapper">
                <QRCodeCanvas value={`${window.location.origin}/verify/business/${business.businessId || business.id}`} size={96} />
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="submit-btn" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              { ["payment_submitted", "paid"].includes(effectiveStatus) ? (
                <>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </>
              ) : (
                <>
                  <option value="pending_evaluation">Pending Evaluation</option>
                  <option value="for_payment">For Payment</option>
                  <option value="rejected">Rejected</option>
                </>
              )}
            </select>

            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add evaluation notes..."
            />

            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="submit-btn">
                Save Changes
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default BusinessEvaluationModal;
