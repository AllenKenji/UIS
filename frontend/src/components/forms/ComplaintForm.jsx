import { useState, useEffect } from "react";
import { api, endpoints, PublicServicesAPI } from "../../services/api";
import { useUser } from "../../context/UserContext";
import { toast } from "react-toastify";
import { validateComplaintPayload } from "../../helpers/validation";
import "./complaint-form.css";

const ComplaintForm = ({ onSubmitSuccess, residentProfile }) => {
  const [residents, setResidents] = useState([]);
  const [formData, setFormData] = useState({
    category: "",
    description: "",
    location: "",
    filed_by: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { userInfo, can, role: sessionRole } = useUser();
  const role = residentProfile ? "resident" : sessionRole;
  const canFile =
    !!residentProfile ||
    (role === "resident" && can("fileComplaints")) ||
    ((role === "staff" || role === "admin") && can("fileComplaintsForResidents"));


  // ✅ Pre-fill filed_by for residents, load resident list for staff
  useEffect(() => {
  if (role === "staff" && canFile) {
    api.get(endpoints.residents, { params: { limit: 100 } })
      .then((res) => {
        const normalized = res.data?.results ?? res.data ?? [];
        console.log("Residents loaded:", normalized); // 🔍 check if authUid is present
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

    let filedByUid = formData.filed_by;
    if (residentProfile) {
      filedByUid = residentProfile.residentId;
    } else if (role === "resident") {
      filedByUid = userInfo?.uid || "";
    }

    const payload = {
      category: formData.category.trim(),
      description: formData.description.trim(),
      location: formData.location.trim(),
      filed_by: filedByUid,
    };

    console.log("Submitting filed_by:", payload.filed_by, "length:", payload.filed_by?.length);

    // ✅ Use helper
    const errors = validateComplaintPayload(payload);

    if (errors.length) {
      setError(errors);
      setLoading(false);
      return;
    }

    try {
      if (residentProfile) {
        await PublicServicesAPI.submitComplaint(payload);
      } else {
        await api.post(endpoints.complaints.base, payload);
      }

      toast.success("✅ Complaint filed successfully!");
      onSubmitSuccess?.();

      setFormData({
        category: "",
        description: "",
        location: "",
        filed_by: residentProfile ? residentProfile.residentId : role === "resident" ? userInfo.uid : "",
      });
    } catch (err) {
      const raw = err.response?.data;
      if (Array.isArray(raw)) {
        setError(raw.map((e) => `${e.loc?.join(".")}: ${e.msg}`));
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
      <h2>{role === "staff" ? "Log Complaint (on behalf of resident)" : "File a Complaint"}</h2>

      {error && (
        <div className="error">
          {Array.isArray(error)
            ? error.map((e, i) => <p key={i}>{e}</p>)
            : <p>{error}</p>}
        </div>
      )}

      <label htmlFor="category">Category</label>
      <select
        id="category"
        name="category"
        value={formData.category}
        onChange={handleChange}
        required
      >
        <option value="">Select category</option>
        <option value="Noise">Noise</option>
        <option value="Service">Service</option>
        <option value="Neighbor">Neighbor</option>
        <option value="Other">Other</option>
      </select>

      <label htmlFor="description">Description</label>
      <textarea
        id="description"
        name="description"
        value={formData.description}
        onChange={handleChange}
        required
      />

      <label htmlFor="location">Location</label>
      <input
        id="location"
        name="location"
        value={formData.location}
        onChange={handleChange}
        required
      />

      {role === "resident" ? (
        // Resident auto-filing
        <input type="hidden" name="filed_by" value={formData.filed_by} />
      ) : (
        // Staff selects resident
        <>
          <label htmlFor="filed_by">Filed By (Resident)</label>
          <select
            id="filed_by"
            name="filed_by"
            value={formData.filed_by}
            onChange={handleChange}
            required
          >
            <option value="">Select a resident</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName || "Unnamed"} — Barangay {r.address?.barangay || "N/A"}
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
