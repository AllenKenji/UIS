import React, { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../../services/firebase"; // adjust path as needed
import "../../styles/admin.css";

const MyIncidents = () => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIncidents = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          setIncidents([]);
          setLoading(false);
          return;
        }

        const q1 = query(collection(db, "incidents"), where("residentId", "==", user.uid));
        const q2 = query(collection(db, "incidents"), where("authUid", "==", user.uid));

        const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

        const data = [...snap1.docs, ...snap2.docs].map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

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
  }, []);

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
                <td>
                  {i.date && i.time
                    ? `${i.date} ${i.time}`
                    : i.createdAt
                      ? new Date(i.createdAt.seconds * 1000).toLocaleString()
                      : "—"}
                </td>
                <td>
                  {i.updatedAt
                    ? new Date(i.updatedAt.seconds * 1000).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default MyIncidents;
