import { useState, useCallback } from "react";
import { toast } from "react-toastify";
import { PasswordAPI } from "../services/api";

export function usePasswordReset() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const requestReset = useCallback(async (targetEmail) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await PasswordAPI.requestReset(targetEmail);
      setEmail(targetEmail);
      toast.success("📬 Password reset email sent. Check your inbox.");
      setSuccess(true);
    } catch (err) {
      console.error("❌ Reset request failed:", err);
      setError(err);
      toast.error(err?.message || "❌ Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyToken = useCallback(async (token) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const data = await PasswordAPI.verifyToken(token);
      setEmail(data.email);
      toast.info("🔑 Reset link verified. Please enter a new password.");
      setSuccess(true);
      return data;
    } catch (err) {
      console.error("❌ Token verification failed:", err);
      setError(err);
      toast.error("❌ Reset link is invalid or expired.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const applyReset = useCallback(async (token, newPassword, confirmPassword) => {
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      await PasswordAPI.applyReset(token, newPassword, confirmPassword);
      toast.success("✅ Password reset successful. You can now log in.");
      setSuccess(true);
      setEmail("");
      return true;
    } catch (err) {
      console.error("❌ Reset apply failed:", err);
      setError(err);
      toast.error(err?.message || "❌ Failed to reset password.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    email,
    error,
    success,
    requestReset,
    verifyToken,
    applyReset,
  };
}
