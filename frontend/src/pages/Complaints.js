import React, { useEffect, useState, useCallback } from "react";
import { api, endpoints, ComplaintsAPI } from "../services/api";
import ComplaintForm from "../components/forms/ComplaintForm";
import ComplaintEvaluationModal from "../components/staff/ComplaintEvaluationModal";
import { useUser } from "../context/UserContext";
import "./complaints.css";

const Complaints = () => {
  const [complaints, setComplaints] = useState([]);
  const [mode, setMode] = useState("dashboard");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const { getToken, role, can, isAuthenticated, loading: authLoading } = useUser();

  // Modal state
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // ✅ Permission checks
  const canViewAll = can("viewAllComplaints"); // admin + staff
  const canViewOwn = can("viewOwnComplaints"); // resident
  const canView = canViewAll || canViewOwn;

  const canFile =
    (role === "resident" && can("fileComplaints")) ||
    ((role === "staff" || role === "admin") && can("fileComplaintsForResidents"));

  const canEvaluate = can("manageComplaints"); // staff + admin
  const canDelete = can("manageComplaints");

  // ✅ Fetch complaints
  const fetchComplaints = useCallback(async () => {
    if (!canView) {
      setError("❌ You do not have permission to view complaints.");
      setLoading(false);
      return;
    }

    try {
      let token = await getToken();
      if (!token) {
        console.warn("⚠️ No token yet, retrying in 500ms...");
        setTimeout(fetchComplaints, 500);
        return;
      }

      const endpoint = canViewAll ? endpoints.complaints.all : endpoints.complaints.mine;
      const { data } = await api.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setComplaints(data);
      setError(null);
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message;
      console.error("❌ Failed to fetch complaints:", errorMsg);
      setError("Failed to load complaints.");
      setComplaints([]);
    } finally {
      setLoading(false);
    }
  }, [canView, canViewAll, getToken]);


  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchComplaints();
    }
  }, [authLoading, isAuthenticated, fetchComplaints]);

  // ✅ Modal handlers
  const openEvaluationModal = (complaint) => {
    setSelectedComplaint(complaint);
    setShowModal(true);
  };

  const handleEvaluationSubmit = async ({ status, notes, resolved_at }) => {
    try {
      await ComplaintsAPI.patchStatus(selectedComplaint.id, {
        status,
        resolution_notes: notes,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
      });
      setShowModal(false);
      setSelectedComplaint(null);
      fetchComplaints();
    } catch (err) {
      console.error("❌ Failed to update complaint:", err);
      alert("Failed to update complaint.");
    }
  };

  // ✅ Delete handler
  const handleDeleteComplaint = async (id) => {
    if (!window.confirm("Are you sure you want to delete this complaint?")) return;
    try {
      await ComplaintsAPI.deleteComplaint(id);
      fetchComplaints();
    } catch (err) {
      console.error("❌ Failed to delete complaint:", err);
      alert("Failed to delete complaint.");
    }
  };

  // 🚫 No access at all
  if (!isAuthenticated || (!canView && !canFile)) {
    return (
      <div className="complaints-page">
        <h2>🗣️ Complaints</h2>
        <p>❌ You do not have access to this module.</p>
      </div>
    );
  }

  // ✅ Dashboard view
  const renderDashboard = () => (
    <>
      <div className="header">
        <h2>{canViewAll ? "Complaints Dashboard" : "My Complaints"}</h2>
        {canFile && <button onClick={() => setMode("form")}>+ Report Complaint</button>}
      </div>

      {loading || authLoading ? (
        <p>Loading complaints...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : complaints.length === 0 ? (
        <p>No complaints found.</p>
      ) : (
        <table className="complaint-table">
          <thead>
            <tr>
              {canViewAll && <th>{role === "resident" ? "Logged By Officer" : "Filed By"}</th>}
              <th>Category</th>
              <th>Description</th>
              <th>Location</th>
              <th>Status</th>
              <th>Timestamp</th>
              <th>Resolution Notes</th>
              {canEvaluate && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {complaints.map((complaint) => (
              <tr key={complaint.id}>
                {canViewAll && (
                  <td>
                    {role === "resident"
                      ? complaint.logged_by_officer || "—"
                      : complaint.filed_by_name}
                  </td>
                )}
                <td>{complaint.category}</td>
                <td>{complaint.description}</td>
                <td>{complaint.location}</td>
                <td>{complaint.status}</td>
                <td>
                  {complaint.timestamp
                    ? new Date(complaint.timestamp).toLocaleString()
                    : "—"}
                </td>
                <td>{complaint.resolution_notes || "—"}</td>
                {(canEvaluate || canDelete) && (
                  <td className="actions-cell">
                    <button
                      className="evaluate-btn"
                      onClick={() => openEvaluationModal(complaint)}
                    >
                      Evaluate
                    </button>
                    {canDelete && (
                      <button
                        className="delete-btn"
                        onClick={() => handleDeleteComplaint(complaint.id)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );

  // ✅ Complaint form view
  const renderForm = () => (
    <>
      <div className="header">
        <h2>
          {role === "staff" || role === "admin"
            ? "Log / Evaluate Complaint"
            : "Report Complaint"}
        </h2>
        <button onClick={() => setMode("dashboard")}>← Back to Dashboard</button>
      </div>
      <ComplaintForm
        onSubmitSuccess={() => {
          fetchComplaints();
          setMode("dashboard");
        }}
      />
    </>
  );

  return (
    <div className="complaints-page" aria-busy={loading} aria-live="polite">
      {mode === "form" ? renderForm() : renderDashboard()}

      {/* ✅ Evaluation Modal */}
      {showModal && selectedComplaint && (
        <ComplaintEvaluationModal
          complaint={selectedComplaint}
          onClose={() => setShowModal(false)}
          onSubmit={handleEvaluationSubmit}
        />
      )}
    </div>
  );
};

export default Complaints;
