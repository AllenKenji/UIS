import { useState } from "react";
import { BusinessesAPI } from "../../services/api";
import "../../styles/resident/resubmission-form.css";

// Mirrors ResubmissionForm.jsx's UX, but resubmits the SAME rejected
// business application in place (documents only) instead of creating a
// new record — see BusinessesAPI.resubmit / POST /businesses/{id}/resubmit.
const BusinessResubmissionForm = ({ business, onSuccess, onCancel }) => {
  const [documents, setDocuments] = useState({
    validId: null,
    proofOfAddress: null,
    dtiCert: null,
    businessLogo: null,
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (field) => (e) => {
    const file = e.target.files?.[0] || null;
    if (file && file.size > 5 * 1024 * 1024) {
      setError("❌ File must be under 5MB.");
      return;
    }
    setError("");
    setDocuments((prev) => ({ ...prev, [field]: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!documents.validId && !documents.proofOfAddress && !documents.dtiCert && !documents.businessLogo) {
      setError("Please attach at least one corrected document before resubmitting.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const identifier = business.businessId || business.id;
      const formData = new FormData();
      formData.append("owner_uid", business.ownerUid);
      if (documents.validId) formData.append("valid_id", documents.validId);
      if (documents.proofOfAddress) formData.append("proof_of_address", documents.proofOfAddress);
      if (documents.dtiCert) formData.append("dti_cert", documents.dtiCert);
      if (documents.businessLogo) formData.append("business_logo", documents.businessLogo);

      await BusinessesAPI.resubmit(identifier, formData);
      setSuccess(true);
      if (onSuccess) setTimeout(() => onSuccess(), 1500);
    } catch (err) {
      console.error("❌ Error resubmitting business application:", err.response?.data?.detail || err.message);
      setError(err.response?.data?.detail || "Failed to resubmit application.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="resubmission-form">
      <h3>🔄 Resubmit Business Application</h3>

      {success ? (
        <p className="success-message">✅ Application resubmitted! Staff will re-review it. Redirecting…</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <p>
            Your application for <strong>{business.businessName}</strong> was rejected
            {business.notes ? <> — <em>{business.notes}</em></> : "."} Attach corrected documents below, then
            resubmit for staff to re-review. You only need to replace the ones that were the problem.
          </p>

          <div className="form-group">
            <label>Valid ID</label>
            <input type="file" accept="image/*,.pdf" onChange={handleFileChange("validId")} />
          </div>

          <div className="form-group">
            <label>Proof of Address</label>
            <input type="file" accept="image/*,.pdf" onChange={handleFileChange("proofOfAddress")} />
          </div>

          <div className="form-group">
            <label>DTI Certificate (optional)</label>
            <input type="file" accept="image/*,.pdf" onChange={handleFileChange("dtiCert")} />
          </div>

          <div className="form-group">
            <label>Business Logo (optional)</label>
            <input type="file" accept="image/*,.pdf" onChange={handleFileChange("businessLogo")} />
          </div>

          {error && <p className="error-message">❌ {error}</p>}

          <div className="step-buttons">
            {onCancel && (
              <button type="button" onClick={onCancel} disabled={loading}>Cancel</button>
            )}
            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Resubmitting…" : "Resubmit"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default BusinessResubmissionForm;
