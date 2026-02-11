import React, { useState, useEffect } from "react";
import { api, endpoints } from "../../services/api";
import { usePublicFees } from "../../hooks/usePublicFees";   // ✅ resident-safe hook
import documentConfig from "../../config/documentConfig";
import "../../styles/resident/resident-document-form.css";

const ResidentDocumentRequestForm = ({ residentId = "", onRequestSubmitted }) => {
  const { documentTypes, loading, error } = usePublicFees();

  const [formData, setFormData] = useState({
    resident_id: residentId,
    document_type: "",
    purpose: "",
    remarks: "",
    fee: 0,
  });

  const [attachments, setAttachments] = useState({});
  const [status, setStatus] = useState({ message: null, type: null });

  // 🔹 Initialize default document type once loaded
  useEffect(() => {
    if (documentTypes.length > 0) {
      const first = documentTypes[0];
      setFormData((prev) => ({
        ...prev,
        document_type: first.documentType,
        fee: first.totalFee,
      }));
    }
  }, [documentTypes]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "document_type") {
      const selected = documentTypes.find((dt) => dt.documentType === value);
      setFormData((prev) => ({
        ...prev,
        document_type: value,
        fee: selected?.totalFee || 0,
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    setAttachments((prev) => ({ ...prev, [field]: file }));
  };

  const validateForm = () => {
    const config = documentConfig[formData.document_type] || {};
    const rules = config.fields || [];
    const attachmentRules = config.attachments || [];

    // Validate text fields
    for (const field of rules) {
      const value = formData[field.name];
      if (field.required && !value) {
        return `${field.label} is required.`;
      }
      if (field.minLength && value.length < field.minLength) {
        return `${field.label} must be at least ${field.minLength} characters.`;
      }
      if (field.min !== undefined && Number(value) < field.min) {
        return `${field.label} must be at least ${field.min}.`;
      }
    }

    // Validate attachments
    for (const att of attachmentRules) {
      const file = attachments[att.name];
      if (att.required && !file) {
        return `${att.label} is required.`;
      }
    }

    return null; // no errors
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errorMsg = validateForm();
    if (errorMsg) {
      setStatus({ message: `❌ ${errorMsg}`, type: "error" });
      return;
    }

    setStatus({ message: "Submitting request...", type: "loading" });

    try {
      const payload = new FormData();
      Object.entries(formData).forEach(([key, value]) => payload.append(key, value));

      // ✅ Append attachments dynamically
      const attachmentRules = documentConfig[formData.document_type]?.attachments || [];
      attachmentRules.forEach(att => {
        if (attachments[att.name]) {
          payload.append(att.name, attachments[att.name]);
        }
      });

      await api.post(endpoints.documents || "/documents", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setStatus({ message: "✅ Request submitted. Awaiting secretary validation.", type: "success" });
      onRequestSubmitted?.();

      setFormData({ 
        resident_id: residentId, 
        document_type: documentTypes.length > 0 ? documentTypes[0].documentType : "", 
        purpose: "", 
        remarks: "", 
        fee: documentTypes.length > 0 ? documentTypes[0].totalFee : 0, 
      }); 
      setAttachments({});

    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      console.error("❌ Error submitting request:", msg);
      setStatus({ message: "❌ Failed to submit request.", type: "error" });
    }
  };

  return (
    <div className="resident-document-form">
      <h2>📝 Request a Barangay Document</h2>

      {loading && <p>Loading document types...</p>}
      {error && <p className="status-message error">❌ {error}</p>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="document_type">Document Type</label>
          <select
            name="document_type"
            value={formData.document_type}
            onChange={handleChange}
            required
          >
            {documentTypes.length > 0 ? (
              documentTypes.map((dt) => (
                <option key={dt.id} value={dt.documentType}>
                  {dt.documentType} — ₱{dt.totalFee}
                </option>
              ))
            ) : (
              <option disabled>Loading types...</option>
            )}
          </select>
        </div>

        {/* Dynamic fields */}
        {documentConfig[formData.document_type]?.fields?.map(field => (
          <div className="form-group" key={field.name}>
            <label htmlFor={field.name}>{field.label}</label>
            {field.type === "textarea" ? (
              <textarea
                id={field.name}
                name={field.name}
                value={formData[field.name] || ""}
                onChange={handleChange}
                required={field.required}
              />
            ) : (
              <input
                id={field.name}
                type={field.type}
                name={field.name}
                value={formData[field.name] || ""}
                onChange={handleChange}
                required={field.required}
              />
            )}
          </div>
        ))}

        {/* Dynamic attachments */}
        {documentConfig[formData.document_type]?.attachments?.map(att => (
          <div className="form-group" key={att.name}>
            <label htmlFor={att.name}>
              {att.label} {att.required && <span className="required">*</span>}
            </label>
            <input
              id={att.name}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              required={att.required}
              onChange={(e) => handleFileChange(e, att.name)}
            />
          </div>
        ))}



        <button type="submit" className="submit-btn">Submit Request</button>
      </form>

      {status.message && (
        <p className={`status-message ${status.type}`}>{status.message}</p>
      )}
    </div>
  );
};

export default ResidentDocumentRequestForm;
