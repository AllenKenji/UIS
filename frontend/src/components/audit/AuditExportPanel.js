import { collection, getCountFromServer } from "firebase/firestore";
import jsPDF from "jspdf";
import { db } from "../../services/firebase";
import { AuditAPI } from "../../services/api";

const safePdfText = (value) => String(value ?? "").replace(/[^\x20-\x7E]/g, "");

const AuditExportPanel = () => {
  const handleExport = async () => {
    try {
      const [residents, businesses, documents, logins, logs] = await Promise.all([
        getCountFromServer(collection(db, "residents")),
        getCountFromServer(collection(db, "businesses")),
        getCountFromServer(collection(db, "documents")),
        getCountFromServer(collection(db, "logins")),
        AuditAPI.list().catch(() => []),
      ]);

      const generatedAt = new Date();
      const generatedAtLabel = generatedAt.toLocaleString();
      const dateTag = generatedAt.toISOString().slice(0, 10);

      const summaryLines = [
        `Generated: ${generatedAtLabel}`,
        `Residents: ${residents.data().count}`,
        `Businesses: ${businesses.data().count}`,
        `Documents: ${documents.data().count}`,
        `Login Events: ${logins.data().count}`,
        `Document Audit Logs: ${Array.isArray(logs) ? logs.length : 0}`,
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
