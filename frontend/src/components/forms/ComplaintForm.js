import React, { useState, useEffect } from "react";
import { api, endpoints } from "../../services/api";
import { useUser } from "../../context/UserContext";
import "./complaint-form.css";

const ComplaintForm = ({ onSubmitSuccess }) => {
  const [residents, setResidents] = useState([]);
  const [formData, setFormData] = useState({
    category: "",
    description: "",
    location: "",
    filed_by: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { userInfo, can, role } = useUser();
  const canFile = can("fileComplaints");

  useEffect(() => {
    if (role === "resident" && userInfo?.uid) {
      setFormData((prev) => ({ ...prev, filed_by: userInfo.uid }));
    } else if (canFile) {
      api
        .get(endpoints.residents, { params: { limit: 100 } })
        .then((res) => {
          const normalized = res.data?.results ?? res.data ?? [];
          setResidents(Array.isArray(normalized) ? normalized : []);
        })
        .catch((err) => {
          const errorMsg = err.response?.data?.detail || err.message;
          console.error("❌ Failed to load residents:", errorMsg);
          setError("Failed to load resident list.");
        });
    }
  }, [role, userInfo, canFile]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      category: formData.category.trim(),
      description: formData.description.trim(),
      location: formData.location.trim(),
      filed_by: formData.filed_by,
    };

    const errors = [];
    if (!payload.category) errors.push("Category is required.");
    if (!["Noise","Service","Neighbor","Other"].includes(payload.category)) errors.push("Invalid category.");
    if (payload.description.length < 5) errors.push("Description must be at least 5 characters.");
    if (!payload.location) errors.push("Location is required.");
    if (!payload.filed_by || payload.filed_by.length !== 28) errors.push("Resident UID must be exactly 28 characters.");

    if (errors.length) {
      setError(errors);
      setLoading(false);
      return;
    }

    try {
      await api.post(endpoints.complaints.base, payload);
      onSubmitSuccess?.();
      setFormData({
        category: "",
        description: "",
        location: "",
        filed_by: role === "resident" ? userInfo.uid : "",
      });
    } catch (err) {
      const raw = err.response?.data;
      if (Array.isArray(raw)) {
        setError(raw.map(e => `${e.loc?.join(".")}: ${e.msg}`));
      } else {
        setError(raw?.detail || err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!canFile) {
    return <p>❌ You do not have permission to file complaints.</p>;
  }

  return (
    <form className="complaint-form" onSubmit={handleSubmit}>
      <h2>File a Complaint</h2>

      {error && (
        <div className="error">
          {Array.isArray(error)
            ? error.map((e, i) => (
                <p key={i}>
                  {e.loc?.join(".")}: {e.msg}
                </p>
              ))
            : <p>{error}</p>}
        </div>
      )}

      <label htmlFor="category">Category</label>
      <select id="category" name="category" value={formData.category} onChange={handleChange} required>
        <option value="">Select category</option>
        <option value="Noise">Noise</option>
        <option value="Service">Service</option>
        <option value="Neighbor">Neighbor</option>
        <option value="Other">Other</option>
      </select>

      <label htmlFor="description">Description</label>
      <textarea id="description" name="description" value={formData.description} onChange={handleChange} required />

      <label htmlFor="location">Location</label>
      <input id="location" name="location" value={formData.location} onChange={handleChange} required />

      {role !== "resident" && (
        <>
          <label htmlFor="filed_by">Filed By (Resident)</label>
          <select id="filed_by" name="filed_by" value={formData.filed_by} onChange={handleChange} required>
            <option value="">Select a resident</option>
            {residents.map((r) => (
              <option key={r.id} value={r.uid}>
                {r.fullName || "Unnamed"} ({r.address?.barangay || "No barangay"})
              </option>
            ))}
          </select>
        </>
      )}

      <button type="submit" disabled={loading}>
        {loading ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
};

export default ComplaintForm;
