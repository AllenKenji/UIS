import React, { useState } from "react";
import { IncidentsAPI } from "../../services/api"; // ✅ centralized API layer

const IncidentEvaluation = ({ incident, role, onClose, onUpdate }) => {
  const [status, setStatus] = useState(incident.status);
  const [assignedTo, setAssignedTo] = useState(incident.assigned_to_name || "");

  const handleUpdate = async () => {
    try {
      // ✅ Both admin and staff can update status and assign
      const payload = {
        status,
        assigned_to: assignedTo || undefined,
      };

      await IncidentsAPI.patchStatus(incident.id, payload);

      onUpdate(); // refresh dashboard
      onClose();  // close evaluation view
    } catch (err) {
      console.error(
        "❌ Failed to update incident:",
        err.response?.data?.detail || err.message
      );
    }
  };

  return (
    <div className="incident-evaluation">
      <h3>Evaluate Incident</h3>

      <div className="incident-details">
        <p><strong>Type:</strong> {incident.type}</p>
        <p><strong>Description:</strong> {incident.description}</p>
        <p><strong>Location:</strong> {incident.location}</p>
        <p><strong>Reported By:</strong> {incident.reported_by_name}</p>
        <p><strong>Current Status:</strong> {incident.status}</p>
        <p><strong>Created At:</strong> {new Date(incident.createdAt).toLocaleString()}</p>
      </div>

      <div className="evaluation-actions">
        <label>
          Status:
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="in-progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="escalated">Escalated</option>
          </select>
        </label>

        {/* ✅ Allow staff to assign too */}
        <label>
          Assign To:
          <input
            type="text"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            placeholder="Staff name or ID"
          />
        </label>

        <div className="buttons">
          <button onClick={handleUpdate}>✅ Save Changes</button>
          <button onClick={onClose}>❌ Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default IncidentEvaluation;
