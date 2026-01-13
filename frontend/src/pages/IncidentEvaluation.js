import React, { useState } from "react";
import { IncidentsAPI } from "../services/api"; // ✅ use centralized API layer

const IncidentEvaluation = ({ incident, role, onClose, onUpdate }) => {
  const [status, setStatus] = useState(incident.status);
  const [assignedTo, setAssignedTo] = useState(incident.assigned_to_name || "");

  const handleUpdate = async () => {
    try {
      if (role === "admin") {
        // Admin can update status + assign staff
        await IncidentsAPI.patchStatus(incident.id, {
          status,
          assigned_to: assignedTo,
        });
      } else if (role === "staff") {
        // Staff can only update status
        await IncidentsAPI.patchStatus(incident.id, { status });
      }
      onUpdate();   // refresh dashboard
      onClose();    // close evaluation view
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
      <p><strong>Type:</strong> {incident.type}</p>
      <p><strong>Description:</strong> {incident.description}</p>
      <p><strong>Location:</strong> {incident.location}</p>
      <p><strong>Reported By:</strong> {incident.reported_by_name}</p>
      <p><strong>Current Status:</strong> {incident.status}</p>

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

        {role === "admin" && (
          <label>
            Assign To:
            <input
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="Staff name or ID"
            />
          </label>
        )}

        <button onClick={handleUpdate}>✅ Save Changes</button>
        <button onClick={onClose}>❌ Cancel</button>
      </div>
    </div>
  );
};

export default IncidentEvaluation;
