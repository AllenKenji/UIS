import { useEffect, useState } from "react";
import { api, endpoints } from "../../services/api";
import { useUser } from "../../context/UserContext";
import "../../styles/dashboard/incident-queue.css";

const IncidentQueue = () => {
  const { can } = useUser();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchIncidents = async () => {
      if (!can("viewIncidents")) {
        setIncidents([]);
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.get(endpoints.incidents, {
          params: { status: "pending" },
        });
        setIncidents(data || []);
        setError(null);
      } catch (err) {
        console.error("❌ Failed to load incidents:", err);
        setError("Failed to load incidents.");
        setIncidents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchIncidents();
  }, [can]);

  const renderContent = () => {
    if (loading) return <p>Loading incidents…</p>;
    if (error) return <p className="error">{error}</p>;
    if (incidents.length === 0) return <p>No incidents available.</p>;

    return (
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
          {incidents.map(
            ({
              id,
              type,
              description,
              location,
              reported_by_name,
              status,
              timestamp,
            }) => (
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
                <td>
                  {timestamp ? new Date(timestamp).toLocaleString() : "—"}
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    );
  };

  return (
    <div className="incident-queue" aria-busy={loading} aria-live="polite">
      <h3>🚨 Incident Queue ({incidents.length} pending)</h3>
      {renderContent()}
    </div>
  );
};

export default IncidentQueue;
