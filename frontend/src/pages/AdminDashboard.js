import SummaryCards from "../components/dashboard/SummaryCards";
import RegistryOverview from "../components/dashboard/RegistryOverview";
import RoleManager from "../components/admin/RoleManager";
import AnalyticsPanel from "../components/admin/AnalyticsPanel";
import DocumentQueue from "../components/dashboard/DocumentQueue";
import ComplaintList from "../components/dashboard/ComplaintList";
import IncidentQueue from "../components/dashboard/IncidentQueue";
import OfficialsSection from "../components/dashboard/RegistryAudit";
import { useUser } from "../context/UserContext";
import { Navigate } from "react-router-dom";
import DashboardSection from "../components/layout/DashboardSection";
import "./adminDashboard.css";

const AdminDashboard = () => {
  const { isAdmin, role } = useUser(); // 👈 get role from context

  if (!isAdmin) {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <section className="dashboard admin-dashboard" aria-label="Admin Dashboard">
      <header className="dashboard-header">
        <h2>🧑‍💼 Barangay Captain Dashboard</h2>
        <p className="dashboard-subtitle">
          Manage registries, roles, complaints, and analytics.
        </p>
      </header>

      <div className="section-stack">
        {/* Registry Management */}
        <DashboardSection
          title="Registry Management"
          icon="📦"
          accent="accent"
          layout="stack"
          ariaLabel="Registry Management"
        >
          <SummaryCards role={role} /> {/* 👈 use actual role */}
          <RegistryOverview />
          <OfficialsSection />
        </DashboardSection>

        {/* Administrative Tools */}
        <DashboardSection
          title="Administrative Tools"
          icon="⚙️"
          accent="success"
          layout="stack"
          ariaLabel="Administrative Tools"
        >
          <RoleManager />
          {/* 👇 Only render AnalyticsPanel if role is admin */}
          {role === "admin" && <AnalyticsPanel role={role} />}
        </DashboardSection>

        {/* Document, Complaints & Incident Queue */}
        <DashboardSection
          title="Document, Complaints & Incident Queue"
          icon="📋"
          accent="danger"
          layout="flex-wrap"
          ariaLabel="Document, Complaints & Incidents"
        >
          <DocumentQueue />
          <ComplaintList />
          <IncidentQueue />
        </DashboardSection>
      </div>
    </section>
  );
};

export default AdminDashboard;
