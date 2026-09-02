import { useEffect, useState } from "react";
import { AccountsAPI, IncidentsAPI } from "../../services/api";

const FIXED_ASSIGNEES = [
  { uid: "Police", label: "Police" },
  { uid: "DSWD", label: "DSWD" },
  { uid: "Firemen", label: "Firemen" },
  { uid: "Barangay Captain", label: "Barangay Captain" },
  { uid: "Barangay Tanod", label: "Barangay Tanod" },
  { uid: "BFP", label: "BFP" },
];

const normalizeStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "in-progress" || normalized === "in_progress" || normalized === "inreview") {
    return "pending";
  }
  if (normalized === "pending" || normalized === "resolved" || normalized === "escalated") {
    return normalized;
  }
  return "pending";
};

const formatDateTime = (value) => {
  if (!value) return "—";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "—" : value.toLocaleString();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
  }
  if (typeof value === "object") {
    const seconds = value.seconds ?? value._seconds;
    if (typeof seconds === "number") {
      const parsed = new Date(seconds * 1000);
      return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
    }
  }
  return "—";
};

const IncidentEvaluation = ({ incident, role, onClose, onUpdate }) => {
  const preferredAssignee = incident.assigned_to_uid || incident.assigned_to_name || "";
  const [status, setStatus] = useState(normalizeStatus(incident.status));
  const [assignedTo, setAssignedTo] = useState(preferredAssignee);
  const [assignees, setAssignees] = useState([]);
  const [loadingAssignees, setLoadingAssignees] = useState(false);

  useEffect(() => {
    const loadAssignees = async () => {
      setLoadingAssignees(true);
      try {
        const accounts = await AccountsAPI.list({ limit: 100 });
        const userOptions = (Array.isArray(accounts) ? accounts : []).filter((account) => ["staff", "admin"].includes(account.role)).map((account) => {
          const label = account.full_name || account.email || account.uid;
          return {
            uid: account.uid,
            label,
          };
        });
        const merged = [...FIXED_ASSIGNEES, ...userOptions].filter(
          (option, index, arr) => arr.findIndex((item) => item.uid === option.uid) === index
        );

        setAssignees(merged);

        if (preferredAssignee) {
          const directMatch = merged.find(
            (opt) => opt.uid.toLowerCase() === String(preferredAssignee).toLowerCase()
          );
          if (directMatch) {
            setAssignedTo(directMatch.uid);
          } else {
            const labelMatch = merged.find(
              (opt) => opt.label.toLowerCase() === String(preferredAssignee).toLowerCase()
            );
            if (labelMatch) setAssignedTo(labelMatch.uid);
          }
        }
      } catch (error) {
        console.error("❌ Failed to load assignee list:", error);
        setAssignees(FIXED_ASSIGNEES);
      } finally {
        setLoadingAssignees(false);
      }
    };

    loadAssignees();
  }, [incident.assigned_to_name, incident.assigned_to_uid, preferredAssignee]);

  const handleUpdate = async () => {
    try {
      
      const payload = {
        status: normalizeStatus(status),
        assigned_to: assignedTo || undefined,
      };

      await IncidentsAPI.patchStatus(incident.id, payload);

      onUpdate(); 
      onClose();  
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
        <p><strong>Created At:</strong> {formatDateTime(incident.timestamp || incident.createdAt)}</p>
      </div>

      <div className="evaluation-actions">
        <label>
          Status:
          <select value={status} onChange={(e) => setStatus(normalizeStatus(e.target.value))}>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
            <option value="escalated">Escalated</option>
          </select>
        </label>

        {/* ✅ Allow staff to assign too */}
        <label>
          Assign To:
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            disabled={loadingAssignees}
          >
            <option value="">Unassigned</option>
            {assignees.map((assignee) => (
              <option key={assignee.uid} value={assignee.uid}>
                {assignee.label}
              </option>
            ))}
          </select>
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
