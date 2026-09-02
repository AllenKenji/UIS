import { useEffect, useState, useCallback } from "react";
import { api, endpoints } from "../services/api";
import IncidentForm from "../components/forms/IncidentForm";
import IncidentEvaluation from "../components/staff/IncidentEvaluation";
import "./incidents.css";

const formatDateTime = (value) => {
  if (!value) return "—";

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "—" : value.toLocaleString();
  }

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

const Incidents = () => {
  const [incidents, setIncidents] = useState([]);
  const [mode, setMode] = useState("dashboard"); 
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const userInfo = JSON.parse(sessionStorage.getItem("userInfo"));
  const role = userInfo?.role || "resident";
  const canDelete = role === "staff" || role === "admin";
  const canLogForResident = role === "staff" || role === "admin";

  const fetchIncidents = useCallback(async () => {
    try {
      
      const url = endpoints.incidents;
      const { data } = await api.get(url);
      setIncidents(data);
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message;
      console.error("❌ Failed to fetch incidents:", errorMsg);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  const handleDeleteIncident = async (incidentId, event) => {
    event.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this incident?")) return;

    try {
      await api.delete(`${endpoints.incidents}/${incidentId}`);
      fetchIncidents();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message;
      console.error("❌ Failed to delete incident:", errorMsg);
      alert("Failed to delete incident.");
    }
  };

  return (
    <div className="incidents-page">
      {selectedIncident ? (
        <IncidentEvaluation
          incident={selectedIncident}
          role={role}
          onClose={() => setSelectedIncident(null)}
          onUpdate={fetchIncidents}
        />
      ) : mode === "form" ? (
        <>
          <div className="header">
            <h2>
              {canLogForResident
                ? "Report / Log Incident"
                : "Report Incident"}
            </h2>
            <button onClick={() => setMode("dashboard")}>← Back to Dashboard</button>
          </div>
          <IncidentForm
            role={role}
            userInfo={userInfo}
            onSubmitSuccess={() => {
              fetchIncidents();
              setMode("dashboard");
            }}
          />
        </>
      ) : (
        <>
          <div className="header">
            <h2>
              {canLogForResident ? "Incident Dashboard" : "Incidents Dashboard"}
            </h2>
            <button onClick={() => setMode("form")}>+ Report Incident</button>
          </div>

          <div className="status-filter-bar">
            {["all", ...Array.from(new Set(incidents.map((i) => i.status).filter(Boolean)))].map(
              (s) => (
                <button
                  key={s}
                  type="button"
                  className={`filter-btn${statusFilter === s ? " active" : ""}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === "all" ? "All" : s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </button>
              )
            )}
          </div>

          {(() => {
            const filtered =
              statusFilter === "all"
                ? incidents
                : incidents.filter((i) => i.status === statusFilter);
            return filtered.length === 0 ? (
              <p>No incidents found{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}.</p>
            ) : (
              <table className="incident-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Location</th>
                    <th>Reported By</th>
                    {role === "staff" && <th>Assigned To</th>}
                    {role === "resident" && <th>Logged By Officer</th>}
                    <th>Status</th>
                    <th>Timestamp</th>
                    {canDelete && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((incident) => (
                    <tr key={incident.id} onClick={() => setSelectedIncident(incident)}>
                      <td>{incident.type}</td>
                      <td>{incident.description}</td>
                      <td>{incident.location}</td>
                      <td>{incident.reported_by_name}</td>
                      {role === "staff" && (
                        <td>{incident.assigned_to_name || "—"}</td>
                      )}
                      {role === "resident" && (
                        <td>{incident.logged_by_officer || "—"}</td>
                      )}
                      <td>
                        <span className={`status-badge status-${(incident.status || "").replace(/_/g, "-")}`}>
                          {incident.status?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—"}
                        </span>
                      </td>
                      <td>{formatDateTime(incident.timestamp || incident.createdAt)}</td>
                      {canDelete && (
                        <td>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteIncident(incident.id, e)}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}
        </>
      )}
    </div>
  );
};

export default Incidents;
