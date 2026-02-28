import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import { toast } from "react-toastify";
import { QRCodeCanvas } from "qrcode.react";
import "./business-eval-modal.css";

const BusinessEvaluationModal = ({ business, onClose, onUpdated }) => {
  const isApproved = business.status === "approved";
  const [status, setStatus] = useState(
    business.status === "payment_submitted" ? "approved" : (business.status || "pending_evaluation")
  );
  const [notes, setNotes] = useState(business.notes || "");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const businessRef = doc(db, "businesses", business.id);
      await updateDoc(businessRef, {
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
          <p><strong>Owner:</strong> {business.ownerName}</p>
          <p><strong>Type:</strong> {business.businessType}</p>
          <p><strong>Barangay:</strong> {business.barangay}</p>
          <p><strong>Address:</strong> {business.address}</p>
          <p><strong>Contact:</strong> {business.contactNumber}</p>
          <p><strong>Submitted:</strong> {business.registrationDate}</p>
        </div>

        <div className="modal-section">
          <h4>Submitted Documents</h4>
          {business.documents?.validId && (
            <p>
              <a href={business.documents.validId} target="_blank" rel="noopener noreferrer">
                📄 View Valid ID
              </a>
            </p>
          )}
          {business.documents?.proofOfAddress && (
            <p>
              <a href={business.documents.proofOfAddress} target="_blank" rel="noopener noreferrer">
                📄 View Proof of Address
              </a>
            </p>
          )}
          {business.documents?.dtiCert && (
            <p>
              <a href={business.documents.dtiCert} target="_blank" rel="noopener noreferrer">
                📄 View DTI Certificate
              </a>
            </p>
          )}
          {business.documents?.businessLogo && (
            <p>
              <a href={business.documents.businessLogo} target="_blank" rel="noopener noreferrer">
                🖼️ View Business Logo
              </a>
            </p>
          )}
        </div>

        {isApproved ? (
          <div className="approved-section">
            <p><strong>Status:</strong> ✅ Approved</p>
            <p><strong>Permit Number:</strong> {business.permitNumber || "—"}</p>
            <div className="qr-wrapper">
              <QRCodeCanvas value={business.businessId || business.id} size={96} />
            </div>
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
              {business.status === "payment_submitted" ? (
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
