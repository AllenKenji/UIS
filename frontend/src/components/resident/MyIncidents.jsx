import { useEffect, useState } from "react";
import { IncidentsAPI } from "../../services/api";
import { useUser } from "../../context/UserContext";
import "../../styles/admin.css";

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

const MyIncidents = ({ residentId } = {}) => {
  const { userInfo } = useUser();
  // Public residents (registered via the barangay portal) never log in, so
  // they're identified by residentId passed in directly rather than the
  // logged-in user context — same pattern as MyDocuments/ResidentBusinessDashboard.
  const ownerUid = residentId || userInfo?.uid;
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        if (!ownerUid) {
          setIncidents([]);
          setLoading(false);
          return;
        }

        const all = residentId
          ? await IncidentsAPI.listMinePublic(residentId)
          : await IncidentsAPI.list();
        const data = (Array.isArray(all) ? all : []).filter((incident) =>
          incident.residentId === ownerUid || incident.authUid === ownerUid
        );

        // remove duplicates if any
        const unique = data.reduce((acc, curr) => {
          acc[curr.id] = curr;
          return acc;
        }, {});
        setIncidents(Object.values(unique));
      } catch (err) {
        console.error("Error fetching incidents:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchIncidents();
  }, [ownerUid, residentId]);

  if (loading) return <p>Loading incidents…</p>;

  return (
    <div className="my-incidents">
      <h3>🚨 My Incidents</h3>

      {incidents.length === 0 ? (
        <p>No incidents reported yet.</p>
      ) : (
        <table className="incident-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th>Status</th>
              <th>Assigned To</th>
              <th>Location</th>
              <th>Remarks</th>
              <th>Reported Date/Time</th>
              <th>Last Updated</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id}>
                <td>{i.type}</td>
                <td>{i.description}</td>
                <td>{i.status}</td>
                <td>{i.assigned_to_name || "—"}</td>
                <td>{i.location}</td>
                <td>{i.remarks || "—"}</td>
                <td>{formatDateTime(i.timestamp || i.createdAt)}</td>
                <td>{formatDateTime(i.updated_at || i.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default MyIncidents;
