import React, { useState } from "react";
import { api } from "../../services/api";
import "../../styles/resident/resubmission-form.css";

const ResubmissionForm = ({ doc, onSuccess }) => {
  const [purpose, setPurpose] = useState(doc.purpose || "");
  const [documentType] = useState(doc.document_type); // locked to original type
  const [idAttachment, setIdAttachment] = useState(null);
  const [residencyAttachment, setResidencyAttachment] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("resident_id", doc.resident_id);
      formData.append("document_type", documentType);
      formData.append("purpose", purpose);
      formData.append("remarks", remarks);
      if (idAttachment) formData.append("idAttachment", idAttachment);
      if (residencyAttachment) formData.append("residencyAttachment", residencyAttachment);

      // Create new document
      await api.post("/api/documents", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // Mark old rejected document as handled
      if (doc.status === "rejected") {
        await api.patch(`/api/documents/${doc.id}/resubmission`, { resubmitted: true });
      }

      setSuccess(true);

      // Redirect after short delay
      if (onSuccess) {
        setTimeout(() => onSuccess(), 1500);
      }
    } catch (err) {
      console.error("❌ Error resubmitting document:", err.response?.data?.detail || err.message);
      setError(err.response?.data?.detail || "Failed to resubmit document.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="resubmission-form">
      <h3>🔄 Resubmit Document</h3>

      {success ? (
        <p className="success-message">✅ Document resubmitted successfully! Redirecting…</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Document Type</label>
            <input type="text" value={documentType} disabled />
          </div>

          <div className="form-group">
            <label>Purpose</label>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Remarks (optional)</label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add any notes for secretary"
            />
          </div>

          <div className="form-group">
            <label>Upload Valid ID</label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setIdAttachment(e.target.files[0])}
              required
            />
          </div>

          <div className="form-group">
            <label>Upload Proof of Residency</label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setResidencyAttachment(e.target.files[0])}
              required
            />
          </div>

          {error && <p className="error-message">❌ {error}</p>}

          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? "Submitting…" : "Resubmit"}
          </button>
        </form>
      )}
    </div>
  );
};

export default ResubmissionForm;
