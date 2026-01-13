import React, { useState } from "react";
import { db } from "../../services/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "react-toastify";

const ReportIncident = () => {
  const userInfo = JSON.parse(sessionStorage.getItem("userInfo"));
  const [form, setForm] = useState({
    type: "",
    description: "",
    location: "",
    date: "",
    time: "",
    witness: "",
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 🔑 Write to incidents collection
      const docRef = await addDoc(collection(db, "incidents"), {
        ...form,
        authUid: userInfo?.uid,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      // 🔔 Trigger notification
      await addDoc(collection(db, "notifications"), {
        type: "incident",
        refId: docRef.id,
        message: `New incident reported: ${form.type} at ${form.location}`,
        notifyRoles: ["admin", "staff"],
        createdAt: serverTimestamp(),
        readBy: [],
      });

      toast.success("✅ Incident report submitted!");
      setForm({
        type: "",
        description: "",
        location: "",
        date: "",
        time: "",
        witness: "",
      });
    } catch (error) {
      console.error("❌ Error reporting incident:", error);
      toast.error("❌ Failed to report incident. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="report-incident">
      <h3>🚨 Report an Incident</h3>
      <form onSubmit={handleSubmit} className="incident-form">
        <input
          type="text"
          name="type"
          placeholder="Incident Type (e.g., Theft, Accident)"
          value={form.type}
          onChange={handleChange}
          required
        />
        <textarea
          name="description"
          placeholder="Describe the incident"
          value={form.description}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="location"
          placeholder="Location"
          value={form.location}
          onChange={handleChange}
          required
        />
        <input
          type="date"
          name="date"
          value={form.date}
          onChange={handleChange}
          required
        />
        <input
          type="time"
          name="time"
          value={form.time}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="witness"
          placeholder="Witness (optional)"
          value={form.witness}
          onChange={handleChange}
        />

        <button type="submit" disabled={loading}>
          {loading ? "Submitting…" : "Submit Report"}
        </button>
      </form>
    </div>
  );
};

export default ReportIncident;
