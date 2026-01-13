// src/pages/ResetPassword.js
import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../services/firebase";
import { toast } from "react-toastify";


const ResetPassword = () => {
  const [email, setEmail] = useState("");

  const handleReset = async (e) => {
    e.preventDefault();
    if (!email) {
      toast.warn("📧 Please enter your email.");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      toast.success("📬 Password reset email sent. Check your inbox.");
    } catch (error) {
      console.error("❌ Reset error:", error);
      toast.error("❌ Failed to send reset email.");
    }
  };

  return (
    <form onSubmit={handleReset} className="reset-form" aria-label="Reset Password Form">
      <h2>🔐 Reset Password</h2>

      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="username"
      />

      <button type="submit">Send Reset Email</button>
    </form>
  );
};

export default ResetPassword;
