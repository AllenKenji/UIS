import React, { useState } from "react";
import { api, endpoints } from "../../services/api";
import "../../styles/resident/resident-document-form.css";

const ResidentDocumentRequestForm = ({ residentId = "", onRequestSubmitted }) => {
  const [formData, setFormData] = useState({
    resident_id: residentId,
    document_type: "Barangay Clearance",
    purpose: "",
    remarks: "",
  });

  // Separate states for ID and Proof of Residency
  const [idAttachment, setIdAttachment] = useState(null);
  const [residencyAttachment, setResidencyAttachment] = useState(null);

  const [status, setStatus] = useState({ message: null, type: null });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation
    if (!formData.resident_id || !formData.document_type) {
      setStatus({ message: "❌ Resident and document type are required.", type: "error" });
      return;
    }
    if (!idAttachment || !residencyAttachment) {
      setStatus({ message: "❌ Please upload both a valid ID and proof of residency.", type: "error" });
      return;
    }

    setStatus({ message: "Submitting request...", type: "loading" });

    try {
      const payload = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        payload.append(key, value);
      });
      payload.append("idAttachment", idAttachment);
      payload.append("residencyAttachment", residencyAttachment);

      await api.post(endpoints.documents || "/documents", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setStatus({ message: "✅ Request submitted. Awaiting secretary validation.", type: "success" });
      onRequestSubmitted?.();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      console.error("❌ Error submitting request:", msg);
      setStatus({ message: "❌ Failed to submit request.", type: "error" });
    }
  };

  return (
    <div className="resident-document-form">
      <h2>📝 Request a Barangay Document</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="document_type">Document Type</label>
          <select id="document_type" name="document_type" value={formData.document_type} onChange={handleChange} required>
            <option value="Barangay Clearance">Clearance</option>
            <option value="Certificate of Residency">Residency</option>
            <option value="Certificate of Indigency">Indigency</option>
            <option value="Certificate of Good Moral Character">Good Moral Character</option>
            <option value="Barangay Business Clearance">Business Clearance</option>
            <option value="Permit to Conduct Activities">Activity Permit</option>
            <option value="Blotter Report">Blotter Report</option>
            <option value="Health Certificate">Health Certificate</option>
            <option value="Barangay ID">Barangay ID</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="purpose">Purpose</label>
          <input
            id="purpose"
            type="text"
            name="purpose"
            value={formData.purpose}
            onChange={handleChange}
            placeholder="e.g. School requirement"
          />
        </div>

        <div className="form-group">
          <label htmlFor="remarks">Remarks</label>
          <textarea
            id="remarks"
            name="remarks"
            value={formData.remarks}
            onChange={handleChange}
            placeholder="Optional notes"
          />
        </div>

        <div className="form-group">
          <label htmlFor="idAttachment">Upload Valid ID <span className="required">*</span></label>
          <input
            id="idAttachment"
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            required
            onChange={(e) => setIdAttachment(e.target.files[0])}
          />
        </div>

        <div className="form-group">
          <label htmlFor="residencyAttachment">Upload Proof of Residency <span className="required">*</span></label>
          <input
            id="residencyAttachment"
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            required
            onChange={(e) => setResidencyAttachment(e.target.files[0])}
          />
        </div>

        <button type="submit" className="submit-btn">Submit Request</button>
      </form>

      {status.message && (
        <p className={`status-message ${status.type}`}>{status.message}</p>
      )}
    </div>
  );
};

export default ResidentDocumentRequestForm;
