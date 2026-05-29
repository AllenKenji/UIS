import { useState } from "react";
import SummaryCards from "../components/dashboard/SummaryCards";
import RegistryOverview from "../components/dashboard/RegistryOverview";
import RoleManager from "../components/admin/RoleManager";
import AnalyticsPanel from "../components/admin/AnalyticsPanel";
import DocumentQueue from "../components/dashboard/DocumentQueue";
import RegistryAudit from "../components/dashboard/RegistryAudit";
import DashboardFocusPanel from "../components/dashboard/DashboardFocusPanel";
import { useUser } from "../context/UserContext";
import { Navigate } from "react-router-dom";
import DashboardSection from "../components/layout/DashboardSection";

import "./adminDashboard.css";

const AdminDashboard = () => {
  const { isAdmin, role } = useUser();
  const [activeView, setActiveView] = useState("overview");
  

  if (!isAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <section aria-label="Admin Dashboard">
      <header className="dashboard-header">
        <h2>🧑‍💼 Barangay Captain Dashboard</h2>
        <p className="dashboard-subtitle">
          Manage registries, roles, complaints, and analytics.
        </p>
      </header>

      <div className="section-stack">
        <DashboardSection
          title="Registry Management"
          icon="📦"
          accent="accent"
          layout="stack"
          ariaLabel="Registry Management"
        >
          <SummaryCards role={role} onCardClick={setActiveView} />
          <RegistryOverview />
          <RegistryAudit />
        </DashboardSection>

        <DashboardSection
          title="Administrative Tools"
          icon="⚙️"
          accent="success"
          layout="stack"
          ariaLabel="Administrative Tools"
        >
          <RoleManager />
          
          {role === "admin" && <AnalyticsPanel role={role} />}
        </DashboardSection>

        <DashboardSection
          title="Dashboard Drill-down"
          icon="📋"
          accent="danger"
          layout="stack"
          ariaLabel="Dashboard Drill-down"
        >
          <DocumentQueue />
          <DashboardFocusPanel view={activeView} />
        </DashboardSection>
      </div>
    </section>
  );
};

export default AdminDashboard;
