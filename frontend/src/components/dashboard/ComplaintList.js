import { useEffect, useState } from "react";
import { ComplaintsAPI } from "../../services/api";
import { useUser } from "../../context/UserContext";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import "../../styles/dashboard/complaint-list.css";

const ComplaintList = () => {
  const { role, can } = useUser();

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const canViewOwn = can("viewOwnComplaints");
  const canViewAll = can("viewAllComplaints");
  const canView = canViewOwn || canViewAll;

  useEffect(() => {
    const auth = getAuth();

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError("❌ Not logged in.");
        setLoading(false);
        return;
      }

      if (!canView) {
        setError("❌ You do not have permission to view complaints.");
        setLoading(false);
        return;
      }

      try {
        // 🔐 Force refresh token before API call
        await user.getIdToken(true);

        const data = canViewAll
          ? await ComplaintsAPI.listAll()
          : await ComplaintsAPI.listMine();

        setComplaints(data);
        setError(null);
      } catch (err) {
        console.error("❌ Failed to load complaints:", err);
        setError("Failed to load complaints.");
        setComplaints([]);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [canView, canViewAll, canViewOwn, role]);

  const renderContent = () => {
    if (!canView) return <p>❌ You do not have access to view complaints.</p>;
    if (loading) return <p>Loading complaints…</p>;
    if (error) return <p className="error">{error}</p>;
    if (complaints.length === 0) return <p>No complaints available.</p>;

    return (
      <table className="complaint-table">
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
              {canViewAll && <td>{c.filed_for_name || c.filed_by_name || "—"}</td>}
              <td>{c.category}</td>
              <td>{c.description}</td>
              <td>{c.location}</td>
              <td>{c.status}</td>
              <td>{c.timestamp ? new Date(c.timestamp).toLocaleString() : "—"}</td>
              <td>{c.resolution_notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="complaint-list">
      <h3>📢 Complaints</h3>
      {renderContent()}
    </div>
  );
};

export default ComplaintList;
