import { collection, getCountFromServer } from "firebase/firestore";
import { db } from "../../services/firebase";
import { AuditAPI } from "../../services/api";

const downloadTextFile = (fileName, content) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

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

      const generatedAt = new Date().toLocaleString();
      const content = [
        "Barangay Audit Summary",
        `Generated: ${generatedAt}`,
        "",
        `Residents: ${residents.data().count}`,
        `Businesses: ${businesses.data().count}`,
        `Documents: ${documents.data().count}`,
        `Login Events: ${logins.data().count}`,
        `Document Audit Logs: ${Array.isArray(logs) ? logs.length : 0}`,
      ].join("\n");

      downloadTextFile(`barangay_audit_summary_${new Date().toISOString().slice(0, 10)}.txt`, content);
    } catch (error) {
      console.error("Audit export failed:", error);
      window.alert("Failed to export audit summary.");
    }
  };

  return (
    <div className="audit-export-panel">
      <h3>📤 Export Tools</h3>
      <p>Download a current audit summary for compliance reviews, offline validation, and reporting.</p>
      <button type="button" onClick={handleExport}>Download Audit Summary</button>
    </div>
  );
};

export default AuditExportPanel;
