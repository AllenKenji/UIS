import { useEffect, useState } from "react";
import { api } from "../../services/api";
import "../../styles/dashboard/audit-table.css";

const normalizeListPayload = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const toDateValue = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const deriveActionLabel = (doc) => {
  const status = String(doc.status || "").toLowerCase();
  if (status === "approved") return "issued";
  if (status === "rejected") return "rejected";
  if (status === "paid") return "payment_confirmed";
  if (status === "for_payment" || status === "payment_submitted") return "payment_pending";
  return "requested";
};

const mapDocumentToAuditEntry = (doc) => ({
  id: doc.id || doc.documentId,
  document_type: doc.documentType || "N/A",
  action: deriveActionLabel(doc),
  performed_by: doc.issuedBy || "System",
  resident_name: doc.residentName,
  resident_id: doc.residentId,
  timestamp: doc.updatedAt || doc.createdAt,
});

const AuditTable = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    setStatus("Fetching audit logs...");
    try {
      const response = await api.get("/api/document_audit");
      const auditLogs = normalizeListPayload(response.data);

      if (auditLogs.length > 0) {
        setLogs(auditLogs);
        setStatus("");
      } else {
        try {
          const docsResponse = await api.get("/api/documents");
          const documents = normalizeListPayload(docsResponse.data);
          const fallbackLogs = documents
            .map(mapDocumentToAuditEntry)
            .sort((a, b) => {
              const aTime = toDateValue(a.timestamp)?.getTime() || 0;
              const bTime = toDateValue(b.timestamp)?.getTime() || 0;
              return bTime - aTime;
            })
            .slice(0, 50);

          setLogs(fallbackLogs);
          setStatus(
            fallbackLogs.length > 0
              ? "Showing recent document activity while audit log entries are being populated."
              : "No audit records found."
          );
        } catch (fallbackErr) {
          console.warn("⚠️ Fallback document activity fetch failed:", fallbackErr?.message || fallbackErr);
          setLogs([]);
          setStatus("No audit records found.");
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message;
      console.error("❌ Error fetching audit logs:", errorMsg);
      setLogs([]);
      setStatus("❌ Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="audit-table">
      <h3>📑 Document Audit Log</h3>
      {status && <p className="status-message">{status}</p>}
      {loading ? (
        <p>Loading audit logs...</p>
      ) : logs.length === 0 ? (
        <p>No audit records found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Document</th>
              <th>Action</th>
              <th>Performed By</th>
              <th>Resident</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id || `${log.doc_id}-${log.timestamp}`}>
                <td>{log.document_type || "N/A"}</td>
                <td>{log.action}</td>
                <td>{log.performed_by}</td>
                <td>{log.resident_name || log.resident_id}</td>
                <td>
                  {log.timestamp
                    ? new Date(log.timestamp).toLocaleString()
                    : "N/A"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AuditTable;
