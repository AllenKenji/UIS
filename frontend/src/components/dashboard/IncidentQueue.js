import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase";
import { useUser } from "../../context/UserContext";
import "../../styles/dashboard/incident-queue.css";

const IncidentQueue = () => {
  const { can } = useUser(); // ✅ centralized permission check
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        // 🔐 Permission check via ROLE_PERMISSIONS
        if (!can("viewIncidents")) {
          setIncidents([]);
          setLoading(false);
          return;
        }

        const snapshot = await getDocs(collection(db, "incidents"));
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
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
      <h3>🚨 Incident Queue</h3>
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
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map(({ id, type, status }) => (
              <tr key={id}>
                <td>{type}</td>
                <td>
                  <span className={`status-badge ${status?.toLowerCase()}`}>
                    {status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default IncidentQueue;
