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
import "../styles/dashboard/role-dashboard.css";

const AdminDashboard = () => {
  const { isAdmin, role } = useUser();
  const [activeView, setActiveView] = useState("overview");
  const [activeTab, setActiveTab] = useState("operations");
  

  if (!isAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <section className="dashboard admin-dashboard role-dashboard role-admin" aria-label="Admin Dashboard">
      <header className="dashboard-header">
        <h2>🧑‍💼 Barangay Captain Dashboard</h2>
        <p className="dashboard-subtitle">
          Manage registries, roles, complaints, and analytics.
        </p>
      </header>

      <div className="dashboard-tabs" role="tablist" aria-label="Admin dashboard tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "operations"}
          className={`dashboard-tab-btn ${activeTab === "operations" ? "active" : ""}`}
          onClick={() => setActiveTab("operations")}
        >
          Operations
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "registry"}
          className={`dashboard-tab-btn ${activeTab === "registry" ? "active" : ""}`}
          onClick={() => setActiveTab("registry")}
        >
          Registry
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "documents"}
          className={`dashboard-tab-btn ${activeTab === "documents" ? "active" : ""}`}
          onClick={() => setActiveTab("documents")}
        >
          Documents
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "tools"}
          className={`dashboard-tab-btn ${activeTab === "tools" ? "active" : ""}`}
          onClick={() => setActiveTab("tools")}
        >
          Administrative Tools
        </button>
      </div>

      <div className="section-stack">
        {activeTab === "operations" && (
          <DashboardSection
            title="Operations Queue"
            icon="📋"
            accent="danger"
            layout="stack"
            ariaLabel="Operations Queue"
          >
            <SummaryCards role={role} onCardClick={setActiveView} />
            <DashboardFocusPanel view={activeView} />
          </DashboardSection>
        )}

        {activeTab === "registry" && (
          <DashboardSection
            title="Registry Management"
            icon="📦"
            accent="accent"
            layout="stack"
            ariaLabel="Registry Management"
          >
            <RegistryOverview />
            <RegistryAudit />
          </DashboardSection>
        )}

        {activeTab === "documents" && (
          <DashboardSection
            title="Document Requests"
            icon="📄"
            accent="info"
            layout="stack"
            ariaLabel="Document Requests"
          >
            <DocumentQueue />
          </DashboardSection>
        )}

        {activeTab === "tools" && (
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
        )}
      </div>
    </section>
  );
};

export default AdminDashboard;
