import React, { useState } from "react";
import SummaryCards from "../components/dashboard/SummaryCards";
import DashboardFocusPanel from "../components/dashboard/DashboardFocusPanel";
import ResidentForm from "../components/forms/ResidentForm";
import { useUser } from "../context/UserContext"; 
import { Navigate } from "react-router-dom";
import "./staff-dashboard.css";

const StaffDashboard = ({ residents, loading }) => {
  const { role } = useUser();
  const [activeForm, setActiveForm] = useState(null);
  const [activeView, setActiveView] = useState("businesses");

  // 🚫 Redirect if not staff
  if (role !== "staff") {
    return <Navigate to="/unauthorized" replace />;
  }

  const openForm = (formType) => setActiveForm(formType);
  const closeForm = () => setActiveForm(null);

  const isOverlayActive = Boolean(activeForm);

  return (
    <section className="dashboard staff-dashboard">
      <header className="dashboard-header flex-between">
        <div className="header-info">
          <h2>👩‍💻 Staff Dashboard</h2>
          <p>Manage incidents, complaints, and resident documentation.</p>
        </div>
        <div className="header-buttons">
          <button className="btn-staff" onClick={() => openForm("resident")}>
            + Resident
          </button>
        </div>
      </header>

      {/* Content area blurs when overlay is active */}
      <div
        className={`staff-dashboard-content ${isOverlayActive ? "blurred" : ""}`}
        aria-hidden={isOverlayActive}
      >
        <SummaryCards role={role} onCardClick={setActiveView} />
        <DashboardFocusPanel view={activeView} />
      </div>

      {isOverlayActive && (
        <div className="form-overlay" role="dialog" aria-modal="true">
          <div className="form-container">
            <button className="close-btn" onClick={closeForm}>✖</button>
            {activeForm === "resident" && <ResidentForm />}
          </div>
        </div>
      )}
    </section>
  );
};

export default StaffDashboard;
