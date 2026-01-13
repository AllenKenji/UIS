import React, { useState } from "react";
import { db } from "../../services/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "react-toastify";

const RegisterBusiness = () => {
  const userInfo = JSON.parse(sessionStorage.getItem("userInfo"));
  const [form, setForm] = useState({
    name: "",
    type: "",
    address: "",
    owner: userInfo?.fullName || "",
    contact: "",
    purpose: "",
  });
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 🔑 Write to businesses collection
      const docRef = await addDoc(collection(db, "businesses"), {
        ...form,
        authUid: userInfo?.uid,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      // 🔔 Trigger notification (simplified)
      await addDoc(collection(db, "notifications"), {
        type: "business",
        refId: docRef.id,
        message: `New business registration: ${form.name}`,
        notifyRoles: ["admin", "staff"],
        createdAt: serverTimestamp(),
        readBy: [],
      });

      toast.success("✅ Business registration submitted!");
      setForm({
        name: "",
        type: "",
        address: "",
        owner: userInfo?.fullName || "",
        contact: "",
        purpose: "",
      });
    } catch (error) {
      console.error("❌ Error registering business:", error);
      toast.error("❌ Failed to register business. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-business">
      <h3>🏢 Register a Business</h3>
      <form onSubmit={handleSubmit} className="business-form">
        <input
          type="text"
          name="name"
          placeholder="Business Name"
          value={form.name}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="type"
          placeholder="Business Type"
          value={form.type}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="address"
          placeholder="Business Address"
          value={form.address}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="contact"
          placeholder="Contact Number"
          value={form.contact}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="purpose"
          placeholder="Purpose (e.g., Permit, Clearance)"
          value={form.purpose}
          onChange={handleChange}
        />

        <button type="submit" disabled={loading}>
          {loading ? "Submitting…" : "Submit Registration"}
        </button>
      </form>
    </div>
  );
};

export default RegisterBusiness;
