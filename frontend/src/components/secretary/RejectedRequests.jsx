import { useEffect, useState } from "react";
import { api } from "../../services/api";

const RejectedRequests = () => {
  const [rejected, setRejected] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRejected = async () => {
      try {
        const { data } = await api.get("/api/documents", {
          params: { status: "rejected" },
        });
        setRejected(data);
      } catch (err) {
        console.error("❌ Error fetching rejected requests:", err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchRejected();
  }, []);

  if (loading) {
    return (
      <div className="sidebar-section">
        <h3>❌ Rejected Requests</h3>
        <p>Loading rejected requests…</p>
      </div>
    );
  }

  return (
    <div className="sidebar-section">
      <h3>❌ Rejected Requests</h3>
      {rejected.length === 0 ? (
        <p>No rejected requests.</p>
      ) : (
        <ul className="rejected-list">
          {rejected.map((doc) => (
            <li key={doc.id} className="rejected-card">
              <div className="rejected-info">
                <strong>{doc.resident_name || doc.resident_id}</strong>
                <span className="doc-type">{doc.document_type}</span>
              </div>
              <p className="rejection-reason">
                <em>Reason:</em> {doc.rejection_reason || "Not specified"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default RejectedRequests;
