import React, { useEffect, useState, useCallback } from "react";
import { api, endpoints } from "../services/api"; // ✅ Shared Axios instance
import IncidentForm from "../components/forms/IncidentForm";
import IncidentEvaluation from "./IncidentEvaluation";
import "./incidents.css";

const Incidents = ({ role = "admin" }) => {
  // role can be "admin" or "staff"
  const [incidents, setIncidents] = useState([]);
  const [mode, setMode] = useState("dashboard"); // "dashboard" or "form"
  const [selectedIncident, setSelectedIncident] = useState(null); 

  const fetchIncidents = useCallback(async () => { 
    try { 
      const url = role === "admin" ? endpoints.incidents : endpoints.staffIncidents; 
      const { data } = await api.get(url); setIncidents(data); 
    } catch (err) { 
      const errorMsg = err.response?.data?.detail || err.message; 
      console.error("❌ Failed to fetch incidents:", errorMsg); 
    } }, [role]); // ✅ depends only on role

  useEffect(() => { 
    fetchIncidents(); 
  }, [fetchIncidents]); // ✅ no warning now

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
            <h2>{role === "staff" ? "Report / Log Incident" : "Report Incident"}</h2>
            <button onClick={() => setMode("dashboard")}>← Back to Dashboard</button>
          </div>
          <IncidentForm
            role={role}
            onSubmitSuccess={() => {
              fetchIncidents();
              setMode("dashboard");
            }}
          />
        </>
      ) : (
        <>
          <div className="header">
            <h2>{role === "admin" ? "Incident Dashboard" : "My Assigned Incidents"}</h2>
            <button onClick={() => setMode("form")}>+ Report Incident</button>
          </div>
          <table className="incident-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th>Location</th>
                <th>Reported By</th>
                <th>Status</th>
                <th>Timestamp</th>
                {role === "admin" && <th>Assigned To</th>}
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr key={incident.id} onClick={() => setSelectedIncident(incident)}>
                  <td>{incident.type}</td>
                  <td>{incident.description}</td>
                  <td>{incident.location}</td>
                  <td>{incident.reported_by_name}</td>
                  <td>{incident.status}</td>
                  <td>{new Date(incident.createdAt).toLocaleString()}</td>
                  {role === "admin" && <td>{incident.assigned_to_name || "—"}</td>}
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
