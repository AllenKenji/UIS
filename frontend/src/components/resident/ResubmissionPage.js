import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import ResubmissionForm from "./ResubmissionForm";

const ResubmissionPage = () => {
  const { docId } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await api.get(`/api/documents/${docId}`);
        setDoc(res.data);
      } catch (err) {
        console.error("❌ Error fetching document:", err.response?.data?.detail || err.message);
        setError(err.response?.data?.detail || "Failed to load document.");
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [docId]);

  if (loading) return <p className="loading-message">⏳ Loading document…</p>;
  if (error) return <p className="error-message">❌ {error}</p>;
  if (!doc) return <p className="error-message">❌ Document not found.</p>;

  return (
    <div className="resubmission-page">
      <header className="resubmission-header">
        <h2>🔄 Resubmission for <span>{doc.document_type}</span></h2>
        <div className="doc-meta">
          <p><strong>Purpose:</strong> {doc.purpose || "—"}</p>
          <p><strong>Status:</strong> {doc.status}</p>
          {doc.remarks && <p className="doc-remarks">Remarks: {doc.remarks}</p>}
        </div>
      </header>

      <ResubmissionForm
        doc={doc}
        onSuccess={() => navigate("/my-documents")}
      />
    </div>
  );
};

export default ResubmissionPage;
