import React, { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, auth } from "../../services/firebase"; // adjust path as needed
import "../../styles/admin.css";

const MyComplaints = () => {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchComplaints = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          setComplaints([]);
          setLoading(false);
          return;
        }

        const q = query(
          collection(db, "complaints"),
          where("residentUid", "==", user.uid)
        );

        const snapshot = await getDocs(q);

        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setComplaints(data);
      } catch (err) {
        console.error("Error fetching complaints:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchComplaints();
  }, []);

  if (loading) return <p>Loading complaints…</p>;

  return (
    <div className="my-complaints">
      <h3>📢 My Complaints</h3>

      {complaints.length === 0 ? (
        <p>No complaints filed yet.</p>
      ) : (
        <ul>
          {complaints.map((c) => (
            <li key={c.id}>
              <strong>{c.issue}</strong> — {c.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MyComplaints;
