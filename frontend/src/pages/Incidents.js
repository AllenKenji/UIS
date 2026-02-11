import React, { useEffect, useState, useCallback } from "react";
import { api, endpoints } from "../services/api";
import IncidentForm from "../components/forms/IncidentForm";
import IncidentEvaluation from "../components/staff/IncidentEvaluation";
import "./incidents.css";

const Incidents = () => {
  const [incidents, setIncidents] = useState([]);
  const [mode, setMode] = useState("dashboard"); // "dashboard" or "form"
  const [selectedIncident, setSelectedIncident] = useState(null);

  // ✅ Grab userInfo once from sessionStorage
  const userInfo = JSON.parse(sessionStorage.getItem("userInfo"));
  const role = userInfo?.role || "resident"; // derive role directly

  const fetchIncidents = useCallback(async () => {
    try {
      // ✅ Staff see all incidents, residents see only theirs (handled by API rules)
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
              {role === "staff"
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
              {role === "staff" ? "Incident Dashboard" : "My Incidents"}
            </h2>
            <button onClick={() => setMode("form")}>+ Report Incident</button>
          </div>
          <table className="incident-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th>Location</th>
                <th>Reported By</th>
                {/* Staff see assignment */}
                {role === "staff" && <th>Assigned To</th>}
                {role === "resident" && <th>Logged By Officer</th>}
                <th>Status</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
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

                  <td>{incident.status}</td>
                  <td>{new Date(incident.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

export default Incidents;
