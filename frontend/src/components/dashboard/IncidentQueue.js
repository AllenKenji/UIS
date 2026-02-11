import React, { useEffect, useState } from "react";
import { api, endpoints } from "../../services/api"; // ✅ use API layer
import { useUser } from "../../context/UserContext";
import "../../styles/dashboard/incident-queue.css";

const IncidentQueue = () => {
  const { can } = useUser();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        if (!can("viewIncidents")) {
          setIncidents([]);
          setLoading(false);
          return;
        }

        // ✅ Fetch incidents via API (already enriched)
        const { data } = await api.get(endpoints.incidents, {
          params: { status: "pending" }, // only pending cases
        });

        setIncidents(data);
      } catch (err) {
        console.error("❌ Failed to load incidents:", err);
        setError("Failed to load incidents.");
      } finally {
        setLoading(false);
      }
    };

    fetchIncidents();
  }, [can]);

  return (
    <div className="incident-queue" aria-busy={loading} aria-live="polite">
      <h3>🚨 Incident Queue ({incidents.length} pending)</h3>
      {loading ? (
        <p>Loading incidents…</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : incidents.length === 0 ? (
        <p>No incidents available.</p>
      ) : (
        <table className="incident-table" aria-label="Incident Queue Table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th>Location</th>
              <th>Reported By</th>
              <th>Status</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map(({ id, type, description, location, reported_by_name, status, createdAt }) => (
              <tr key={id}>
                <td>{type}</td>
                <td>{description}</td>
                <td>{location}</td>
                <td>{reported_by_name || "—"}</td>
                <td>
                  <span
                    className={`status-badge ${
                      status?.toLowerCase() === "escalated"
                        ? "escalated"
                        : status?.toLowerCase()
                    }`}
                  >
                    {status === "escalated" ? "Escalated" : status}
                  </span>
                </td>
                <td>{createdAt ? new Date(createdAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default IncidentQueue;
