import { useEffect, useState } from "react";
import { ComplaintsAPI } from "../../services/api";
import { useUser } from "../../context/UserContext";
import { formatPhilippineDateTime } from "../../utils/dateTime";
import "../../styles/dashboard/complaint-list.css";

const normalizeStatus = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

const ComplaintList = ({ statusFilter = "all", excludeStatus = null, title = "📢 Complaints", residentId = null }) => {
  const { role, can, isAuthenticated } = useUser();

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Public residents (registered via the barangay portal) never log in, so
  // a residentId passed in directly bypasses the login/permission checks
  // below — same pattern as MyDocuments/ResidentBusinessDashboard.
  const canViewOwn = residentId || can("viewOwnComplaints");
  const canViewAll = !residentId && can("viewAllComplaints");
  const canView = canViewOwn || canViewAll;

  useEffect(() => {
    const loadComplaints = async () => {
      if (!residentId && !isAuthenticated) {
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
        const data = residentId
          ? await ComplaintsAPI.listMinePublic(residentId)
          : canViewAll
            ? await ComplaintsAPI.listAll()
            : await ComplaintsAPI.listMine();

        const filtered = Array.isArray(data)
          ? data.filter((item) => {
              if (excludeStatus && normalizeStatus(item.status) === normalizeStatus(excludeStatus)) {
                return false;
              }
              if (statusFilter === "all") return true;
              return normalizeStatus(item.status) === normalizeStatus(statusFilter);
            })
          : [];

        setComplaints(filtered);
        setError(null);
      } catch (err) {
        console.error("❌ Failed to load complaints:", err);
        setError("Failed to load complaints.");
        setComplaints([]);
      } finally {
        setLoading(false);
      }
    };
    loadComplaints();
  }, [canView, canViewAll, canViewOwn, excludeStatus, residentId, role, statusFilter, isAuthenticated]);

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
              <td>
                <span
                  className={`status-badge ${normalizeStatus(c.status).replace(/_/g, "-")} ${normalizeStatus(c.status)}`}
                >
                  {c.status || "—"}
                </span>
              </td>
              <td>{formatPhilippineDateTime(c.timestamp, "—")}</td>
              <td>{c.resolution_notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="complaint-list">
      <h3>{title}</h3>
      {renderContent()}
    </div>
  );
};

export default ComplaintList;
