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

        const q = query(
            collection(db, "incidents"),
            where("authUid", "==", user.uid) // ✅ corrected field
        );

        const snapshot = await getDocs(q);

        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setIncidents(data);
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
        <ul>
          {incidents.map((i) => (
            <li key={i.id}>
                <strong>{i.type}</strong> — {i.status}
                <div>{i.description}</div>
            </li>
            ))}
        </ul>
      )}
    </div>
  );
};

export default MyIncidents;
