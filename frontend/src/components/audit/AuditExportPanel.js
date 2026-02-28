import "../../styles/admin.css";

const AuditExportPanel = () => {
  const handleExport = () => {
    console.log("Audit export triggered");
    // TODO: Generate and download audit report
  };

  return (
    <div className="audit-export-panel">
      <h3>📤 Export Tools</h3>
      <p>Download audit logs, registry snapshots, or compliance summaries for offline review.</p>
      <button onClick={handleExport}>Export Audit Report</button>
    </div>
  );
};

export default AuditExportPanel;
