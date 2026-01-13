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
  const { getToken } = useUser();

  // Modal state
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const { role, can, isAuthenticated, loading: authLoading } = useUser();

  // ✅ Permission checks
  const canViewAll = can("viewAllComplaints"); // admin + staff
  const canViewOwn = can("viewOwnComplaints"); // resident
  const canView = canViewAll || canViewOwn;

  const canFile = role === "resident" && can("fileComplaints");
  const canEvaluate = can("manageComplaints"); // staff + admin

  // ✅ Fetch complaints
  const fetchComplaints = useCallback(async () => {
    if (!canView) {
      setError("❌ You do not have permission to view complaints.");
      setLoading(false);
      return;
    }

    try {
      const token = await getToken();
      if (!token) throw new Error("Missing ID token");

      const endpoint = canViewAll
        ? endpoints.complaints.all
        : endpoints.complaints.mine;

      const { data } = await api.get(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
    fetchComplaints();
  }, [fetchComplaints]);

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
        <h2>Complaints Dashboard</h2>
        {canFile && (
          <button onClick={() => setMode("form")}>+ File Complaint</button>
        )}
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
              {canViewAll && <th>Filed By</th>}
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
                {canViewAll && <td>{complaint.filed_by_name}</td>}
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

                {canEvaluate && (
                  <td>
                    <button
                      className="evaluate-btn"
                      onClick={() => openEvaluationModal(complaint)}
                    >
                      Evaluate
                    </button>
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
        <h2>File a Complaint</h2>
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
