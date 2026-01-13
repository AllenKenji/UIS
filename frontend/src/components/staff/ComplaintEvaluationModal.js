import React, { useState } from "react";
import "./modal.css";

const ComplaintEvaluationModal = ({ complaint, onClose, onSubmit }) => {
  const [status, setStatus] = useState(complaint.status || "open");
  const [notes, setNotes] = useState(complaint.resolution_notes || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation
    if (status === "resolved" && notes.trim().length === 0) {
      alert("Please add resolution notes before marking as resolved.");
      return;
    }

    setSaving(true);

    try {
      await onSubmit({
        status,
        notes,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-container">
        <h2>Evaluate Complaint</h2>

        {/* Resident-submitted details (read-only) */}
        <div className="modal-section">
          <p><strong>ID:</strong> {complaint.id}</p>
          <p><strong>Filed By:</strong> {complaint.filed_by_name}</p>
          <p><strong>Category:</strong> {complaint.category}</p>
          <p><strong>Description:</strong> {complaint.description}</p>
          <p><strong>Location:</strong> {complaint.location}</p>
        </div>

        {/* Staff evaluation form */}
        <form onSubmit={handleSubmit} className="modal-form">
          <label>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>

          <label>Resolution Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add resolution notes here..."
            rows={5}
          />

          <div className="modal-actions">
            <button
              type="button"
              className="cancel-btn"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="submit-btn"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ComplaintEvaluationModal;
