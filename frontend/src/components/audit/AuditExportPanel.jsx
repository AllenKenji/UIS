import jsPDF from "jspdf";
import { AuditAPI } from "../../services/api";

const safePdfText = (value) => String(value ?? "").replace(/[^\x20-\x7E]/g, "");
const normalizeListPayload = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const AuditExportPanel = () => {
  const handleExport = async () => {
    try {
      const [summary, logsResponse] = await Promise.all([
        AuditAPI.summary(),
        AuditAPI.list(),
      ]);
      const logs = normalizeListPayload(logsResponse);

      const generatedAt = new Date();
      const generatedAtLabel = generatedAt.toLocaleString();
      const dateTag = generatedAt.toISOString().slice(0, 10);

      const summaryLines = [
        `Generated: ${generatedAtLabel}`,
        `Residents: ${summary?.residents ?? "N/A"}`,
        `Businesses: ${summary?.businesses ?? "N/A"}`,
        `Documents: ${summary?.documents ?? "N/A"}`,
        `Login Events: ${summary?.logins ?? "N/A"}`,
        `Document Audit Logs: ${summary?.auditLogs ?? logs.length}`,
      ];

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const left = 48;
      let y = 60;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text(safePdfText("Barangay Audit Summary"), left, y);

      y += 24;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      summaryLines.forEach((line) => {
        doc.text(safePdfText(line), left, y);
        y += 18;
      });

      doc.save(`barangay_audit_summary_${dateTag}.pdf`);
    } catch (error) {
      console.error("Audit export failed:", error);
      window.alert("Failed to export audit summary.");
    }
  };

  return (
    <div className="audit-export-panel">
      <h3>📤 Export Tools</h3>
      <p>Download a current audit summary for compliance reviews, offline validation, and reporting.</p>
      <button type="button" onClick={handleExport}>Download Audit Summary (PDF)</button>
    </div>
  );
};

export default AuditExportPanel;
