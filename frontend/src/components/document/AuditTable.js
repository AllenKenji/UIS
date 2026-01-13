import React, { useEffect, useState } from "react";
import { api } from "../../services/api";
import "../../styles/dashboard/audit-table.css";

const AuditTable = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    setStatus("Fetching audit logs...");
    try {
      const response = await api.get("/api/document_audit"); // ✅ include /api prefix
      setLogs(response.data || []);
      setStatus("");
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message;
      console.error("❌ Error fetching audit logs:", errorMsg);
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
