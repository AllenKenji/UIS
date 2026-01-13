import React, { useState } from "react";
import "./business-eval-modal.css";

const BusinessEvaluationModal = ({ business, onClose, onSubmit }) => {
  const [status, setStatus] = useState(business.status || "pending_evaluation");
  const [notes, setNotes] = useState(business.notes || "");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ status, notes });
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

          {/* 🔎 Show all uploaded documents */}
          {business.documents && (
            <div className="documents-list">
              {business.documents.validId && (
                <p>
                  <a href={business.documents.validId} target="_blank" rel="noopener noreferrer">
                    📎 View Valid ID
                  </a>
                </p>
              )}
              {business.documents.proofOfAddress && (
                <p>
                  <a href={business.documents.proofOfAddress} target="_blank" rel="noopener noreferrer">
                    📎 View Proof of Address
                  </a>
                </p>
              )}
              {business.documents.dtiCert && (
                <p>
                  <a href={business.documents.dtiCert} target="_blank" rel="noopener noreferrer">
                    📎 View DTI Certificate
                  </a>
                </p>
              )}
              {business.documents.businessLogo && (
                <p>
                  <a href={business.documents.businessLogo} target="_blank" rel="noopener noreferrer">
                    📎 View Business Logo
                  </a>
                </p>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending_evaluation">Pending Evaluation</option>
            <option value="for_payment">For Payment</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
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
      </div>
    </div>
  );
};

export default BusinessEvaluationModal;
