import React from "react";
import ComplianceReport from "../components/audit/ComplianceReport";
import SystemUsageStats from "../components/audit/SystemUsageStats";
import RegistrySnapshot from "../components/audit/RegistrySnapshot";
import AuditExportPanel from "../components/audit/AuditExportPanel";
import "../styles/admin.css";

const AuditView = () => {
  return (
    <section className="dashboard audit-dashboard">
      <header>
        <h2>🕵️ DILG Audit View</h2>
        <p>Review compliance, monitor system usage, and access registry snapshots.</p>
      </header>

      <div className="audit-tools">
        <section className="tool-section">
          <h3>📑 Compliance Report</h3>
          <ComplianceReport />
        </section>

        <section className="tool-section">
          <h3>📊 System Usage Stats</h3>
          <SystemUsageStats />
        </section>

        <section className="tool-section">
          <h3>📁 Registry Snapshot</h3>
          <RegistrySnapshot />
        </section>

        <section className="tool-section">
          <h3>📤 Export Tools</h3>
          <AuditExportPanel />
        </section>
      </div>
    </section>
  );
};

export default AuditView;
