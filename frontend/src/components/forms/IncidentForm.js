import { useState, useEffect } from "react";
import { api, endpoints } from "../../services/api";
import { auth, db } from "../../services/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "react-toastify";
import "./incident-form.css";

const IncidentForm = ({ role = "resident", userInfo, onSubmitSuccess }) => {
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(false);

  const initialForm = {
    type: "",
    description: "",
    location: "",
    date: "",
    time: "",
    witness: "",
    // ✅ Always ensure residentId is set
    residentId: role === "resident" ? userInfo?.uid || "" : "",
  };

  const [formData, setFormData] = useState(initialForm);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      ...initialForm,
      residentId: role === "resident" ? userInfo?.uid || "" : "",
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // ✅ Basic validation
      if (formData.description.trim().length < 5) {
        toast.error("Description must be at least 5 characters long.");
        setLoading(false);
        return;
      }

      if (role === "resident") {
        // 🔐 Ensure we have a logged-in Firebase user
        const currentUser = auth.currentUser;
        if (!currentUser) {
          toast.error("You must be logged in to report an incident.");
          setLoading(false);
          return;
        }

        // Resident self-report → Firestore
        const incidentAt = new Date(`${formData.date}T${formData.time}`);
        const docRef = await addDoc(collection(db, "incidents"), {
          type: formData.type,
          description: formData.description,
          location: formData.location,
          witness: formData.witness,
          authUid: currentUser.uid,     // ✅ always from Firebase Auth
          residentId: currentUser.uid,  // ✅ same for self-report
          status: "pending",
          incidentAt,
          createdAt: serverTimestamp(),
        });

        // Notification for admins/staff
        await addDoc(collection(db, "notifications"), {
          type: "incident",
          refId: docRef.id,
          message: `New incident reported: ${formData.type} at ${formData.location}`,
          notifyRoles: ["staff"], // ✅ only staff now
          createdAt: serverTimestamp(),
          readBy: [],
        });

        toast.success("✅ Incident report submitted!");
      } else if (role === "staff") {
        // Staff reporting → Firestore directly
        if (!formData.residentId) {
          toast.error("Please select a resident.");
          setLoading(false);
          return;
        }

        // 🔐 Ensure we have a logged-in Firebase user
        const currentUser = auth.currentUser;
        if (!currentUser) {
          toast.error("You must be logged in as staff to log an incident.");
          setLoading(false);
          return;
        }

        // Staff logs incident on behalf of a resident
        const docRef = await addDoc(collection(db, "incidents"), {
          type: formData.type,
          description: formData.description,
          location: formData.location,
          authUid: currentUser.uid,       // ✅ staff UID
          residentId: formData.residentId, // ✅ resident selected
          status: "pending",
          incidentAt: new Date().toISOString(), // staff logs current time
          createdAt: serverTimestamp(),
        });

        // Notification for staff
        await addDoc(collection(db, "notifications"), {
          type: "incident",
          refId: docRef.id,
          message: `Incident logged: ${formData.type} at ${formData.location}`,
          notifyRoles: ["staff"],
          createdAt: serverTimestamp(),
          readBy: [],
        });

        toast.success("✅ Incident logged on behalf of resident!");
      }

      // ✅ Reset and refresh
      onSubmitSuccess?.();
      resetForm();
    } catch (err) {
      console.error("❌ Incident submission failed:", err.response?.data || err.message);
      toast.error("❌ Failed to report incident. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Staff only: fetch resident list
  useEffect(() => {
    if (role === "staff") {
      api.get(endpoints.residents, { params: { limit: 100 } })
        .then((res) => {
          const raw = res.data;
          const normalized = Array.isArray(raw)
            ? raw
            : Array.isArray(raw?.results)
            ? raw.results
            : Array.isArray(raw?.items)
            ? raw.items
            : Array.isArray(raw?.data)
            ? raw.data
            : [];
          setResidents(normalized);
        })
        .catch((err) => {
          console.error("❌ Failed to load residents:", err.response?.data || err.message);
        });
    }
  }, [role]);

  return (
    <form className="incident-form" onSubmit={handleSubmit}>
      <h2>{role === "staff" ? "Log Incident (on behalf of resident)" : "Report Incident"}</h2>

      <label>Type</label>
      <select name="type" value={formData.type} onChange={handleChange} required>
        <option value="">Select type</option>
        <option value="Theft">Theft</option>
        <option value="Dispute">Dispute</option>
        <option value="Accident">Accident</option>
        <option value="Other">Other</option>
      </select>

      <label>Description</label>
      <textarea
        name="description"
        value={formData.description}
        onChange={handleChange}
        required
        minLength={5}
      />

      <label>Location</label>
      <input name="location" value={formData.location} onChange={handleChange} required />

      {role === "resident" && (
        <>
          <label>Date</label>
          <input type="date" name="date" value={formData.date} onChange={handleChange} required />

          <label>Time</label>
          <input type="time" name="time" value={formData.time} onChange={handleChange} required />

          <label>Witness (optional)</label>
          <input name="witness" value={formData.witness} onChange={handleChange} />
        </>
      )}

      {role === "staff" && (
        <>
          <label>Reported Resident</label>
          <select
            name="residentId"
            value={formData.residentId}
            onChange={handleChange}
            required
          >
            <option value="">Select a resident</option>
            {residents.map((r) => (
              <option key={r.id} value={r.id}>
                {r.fullName || r.name || "Unnamed"} — Barangay {r.address?.barangay || "N/A"}
              </option>
            ))}
          </select>
        </>
      )}

      <button type="submit" disabled={loading}>
        {loading ? "Submitting…" : "Submit Report"}
      </button>
    </form>
  );
};

export default IncidentForm;
