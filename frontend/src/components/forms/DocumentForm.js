import React, { useEffect, useState } from "react";
import { api, endpoints } from "../../services/api"; // ✅ Use shared Axios instance
import "./document-form.css";

const DocumentForm = ({ residentId = "", onDocumentCreated }) => {
  const [residents, setResidents] = useState([]);
  const [formData, setFormData] = useState({
    resident_id: residentId,
    type: "Residency",
    purpose: "",
    issued_by: "",
    remarks: "",
  });

  const [status, setStatus] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);

  // 🔄 Sync residentId from parent
  useEffect(() => {
    setFormData((prev) => ({ ...prev, resident_id: residentId }));
  }, [residentId]);

  // 📥 Fetch resident list
  useEffect(() => {
    api
      .get(endpoints.residents, { params: { limit: 100 } })
      .then((res) => {
        const raw = res.data;
        const normalized = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.results)
          ? raw.results
          : [];
        setResidents(normalized);
      })
      .catch((err) => {
        const msg = err.response?.data?.detail || err.message;
        console.error("❌ Failed to load residents:", msg);
      });
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus("Generating document...");
    setFileUrl(null);

    try {
      const { data } = await api.post(endpoints.documents || "/documents", formData);
      setFileUrl(data.file_url || data.url);
      setStatus("✅ Document generated successfully.");
      onDocumentCreated?.();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      console.error("❌ Error generating document:", msg);
      setStatus("❌ Failed to generate document.");
    }
  };

  return (
    <div className="document-form">
      <h2>📝 Generate Barangay Document</h2>
      <form onSubmit={handleSubmit}>
        <label>Resident</label>
        <select
          name="resident_id"
          value={formData.resident_id}
          onChange={handleChange}
          required
        >
          <option value="">Select a resident</option>
          {residents.map((r) => (
            <option key={r.id} value={r.id}>
              {r.fullName || "Unnamed"} ({r.address?.barangay || "No barangay"})
            </option>
          ))}
        </select>

        <label>Document Type</label>
        <select name="type" value={formData.type} onChange={handleChange}>
          <option value="Certificate of Residency">Residency</option>
          <option value="Barangay Clearance">Clearance</option>
          <option value="Certificate of Indigency">Indigency</option>
          <option value="Certificate of Good Moral Character">Good Moral Character</option>
          <option value="Barangay Business Clearance">Business Clearance</option>
          <option value="Permit to Conduct Activities">Activity Permit</option>
          <option value="Blotter Report">Blotter Report</option>
          <option value="Health Certificate">Health Certificate</option>
          <option value="Barangay ID">Barangay ID</option>
        </select>

        <label>Purpose</label>
        <input
          type="text"
          name="purpose"
          value={formData.purpose}
          onChange={handleChange}
          placeholder="e.g. School requirement"
        />

        <label>Issued By</label>
        <input
          type="text"
          name="issued_by"
          value={formData.issued_by}
          onChange={handleChange}
          required
        />

        <label>Remarks</label>
        <textarea
          name="remarks"
          value={formData.remarks}
          onChange={handleChange}
          placeholder="Optional notes or instructions"
        />

        <button type="submit">Generate Document</button>
      </form>

      {status && <p className="status-message">{status}</p>}
      {fileUrl && (
        <p>
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            📎 View Generated Document
          </a>
        </p>
      )}
    </div>
  );
};

export default DocumentForm;
