import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../../services/firebase";
import { useUser } from "../../context/UserContext";
import "../../styles/dashboard/complaint-list.css";

const ComplaintList = () => {
  const { role, can, userInfo } = useUser();

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ✅ Permission checks
  const canViewOwn = can("viewOwnComplaints");
  const canViewAll = can("viewAllComplaints");

  // ✅ Final access flag
  const canView = canViewOwn || canViewAll;

  useEffect(() => {
    const fetchComplaints = async () => {
      if (!canView) {
        setError("❌ You do not have permission to view complaints.");
        setLoading(false);
        return;
      }

      try {
        let q;

        if (canViewAll) {
          // ✅ Admin/staff: view ALL complaints
          q = query(collection(db, "complaints"), orderBy("timestamp", "desc"));
        } else if (canViewOwn) {
          // ✅ Resident: view ONLY their own complaints
          q = query(
            collection(db, "complaints"),
            where("filed_by", "==", userInfo.uid),
            orderBy("timestamp", "desc")
          );
        }

        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          setComplaints([]);
          setError(null);
        } else {
          const data = snapshot.docs.map((doc) => {
            const raw = doc.data();
            return {
              id: doc.id,
              filed_by_name: raw.filed_by_name || "Unknown",
              category: raw.category || "—",
              description: raw.description || "—",
              location: raw.location || "—",
              status: raw.status || "open",
              resolution_notes: raw.resolution_notes || "",
              timestamp: raw.timestamp?.toDate?.() || null,
            };
          });

          setComplaints(data);
          setError(null);
        }
      } catch (err) {
        console.error("❌ Failed to load complaints:", err);
        setError("Failed to load complaints.");
        setComplaints([]);
      } finally {
        setLoading(false);
      }
    };

    fetchComplaints();
  }, [canView, canViewAll, canViewOwn, role, userInfo]);

  // ✅ Render logic
  const renderContent = () => {
    if (!canView) return <p>❌ You do not have access to view complaints.</p>;
    if (loading) return <p>Loading complaints…</p>;
    if (error) return <p className="error">{error}</p>;
    if (complaints.length === 0) return <p>No complaints available.</p>;

    return (
      <table className="complaint-table" aria-label="Complaints Table">
        <thead>
          <tr>
            {canViewAll && <th>Resident</th>}
            <th>Category</th>
            <th>Description</th>
            <th>Location</th>
            <th>Status</th>
            <th>Timestamp</th>
            <th>Resolution Notes</th>
          </tr>
        </thead>
        <tbody>
          {complaints.map((c) => (
            <tr key={c.id}>
              {canViewAll && <td>{c.filed_by_name}</td>}
              <td>{c.category}</td>
              <td>{c.description}</td>
              <td>{c.location}</td>
              <td>
                <span className={`status-badge ${c.status?.replace(/[_\s]+/g, '').toLowerCase()}`}>
                  {c.status.replace(/_/g, ' ')} {/* display nicely */}
                </span>
              </td>
              <td>{c.timestamp ? c.timestamp.toLocaleString() : "—"}</td>
              <td>{c.resolution_notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="complaint-list" aria-busy={loading} aria-live="polite">
      <h3>📢 Complaints</h3>
      {renderContent()}
    </div>
  );
};

export default ComplaintList;
