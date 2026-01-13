import React, { useState, useEffect } from "react";
import { api, endpoints } from "../../services/api"; // ✅ Use shared Axios instance
import "./incident-form.css";

const IncidentForm = ({ onSubmitSuccess }) => {
  const [residents, setResidents] = useState([]);
  const [formData, setFormData] = useState({
    type: "",
    description: "",
    location: "",
    reported_by: "", // resident ID
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      timestamp: new Date().toISOString(),
    };
    try {
      await api.post(endpoints.incidents, payload);
      onSubmitSuccess?.();
      setFormData({ type: "", description: "", location: "", reported_by: "" });
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      console.error("❌ Incident submission failed:", msg);
    }
  };

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

  return (
    <form className="incident-form" onSubmit={handleSubmit}>
      <h2>Report Incident</h2>

      <label>Type</label>
      <select name="type" value={formData.type} onChange={handleChange} required>
        <option value="">Select type</option>
        <option value="Theft">Theft</option>
        <option value="Dispute">Dispute</option>
        <option value="Accident">Accident</option>
        <option value="Other">Other</option>
      </select>

      <label>Description</label>
      <textarea name="description" value={formData.description} onChange={handleChange} required />

      <label>Location</label>
      <input name="location" value={formData.location} onChange={handleChange} required />

      <label>Reported By (Resident ID)</label>
      <select
        name="reported_by"
        value={formData.reported_by}
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

      <button type="submit">Submit</button>
    </form>
  );
};

export default IncidentForm;
