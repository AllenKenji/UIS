import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import { usePasswordReset } from "../hooks/usePasswordReset"; // ✅ use the hook

const ResetPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { verifyToken, applyReset, loading, email } = usePasswordReset();
  const [isValidToken, setIsValidToken] = useState(false);

  // Verify token on mount
  useEffect(() => {
    const checkToken = async () => {
      if (!token) return;
      const data = await verifyToken(token);
      if (data) {
        setIsValidToken(true);
      }
    };
    checkToken();
  }, [token, verifyToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.warn("⚠️ Passwords do not match.");
      return;
    }

    const success = await applyReset(token, newPassword, confirmPassword);
    if (success) {
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  if (!token) {
    return <p>❌ No reset token provided.</p>;
  }

  if (!isValidToken) {
    return <p>❌ Reset link is invalid or expired.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="reset-form" aria-label="Set New Password Form">
      <h2>🔐 Set New Password</h2>
      <p>Resetting password for: <strong>{email}</strong></p>

      <label htmlFor="newPassword">New Password</label>
      <input
        id="newPassword"
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
        disabled={loading}
      />

      <label htmlFor="confirmPassword">Confirm Password</label>
      <input
        id="confirmPassword"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
        disabled={loading}
      />

      <button type="submit" disabled={loading}>
        {loading ? "Resetting..." : "Reset Password"}
      </button>
    </form>
  );
};

export default ResetPage;
