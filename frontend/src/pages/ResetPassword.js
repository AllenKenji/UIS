import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { usePasswordReset } from "../hooks/usePasswordReset";
import "../styles/reset-password.css"

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isValidToken, setIsValidToken] = useState(false);

  const { requestReset, verifyToken, applyReset, loading, email: verifiedEmail } = usePasswordReset();

  // ✅ Verify token if present
  useEffect(() => {
    const checkToken = async () => {
      if (!token) return;
      const data = await verifyToken(token);
      if (data) setIsValidToken(true);
    };
    checkToken();
  }, [token, verifyToken]);

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.warn("📧 Please enter your email.");
      return;
    }
    await requestReset(email);
    setEmail("");
  };

  const handleApply = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.warn("⚠️ Passwords do not match.");
      return;
    }
    const success = await applyReset(token, newPassword, confirmPassword);
    if (success) {
      setNewPassword("");
      setConfirmPassword("");
      toast.success("✅ Password reset successful. Redirecting to login...");
      setTimeout(() => navigate("/login"), 2000); // redirect after 2s
    }
  };

  // ✅ Apply mode
  if (token) {
    if (!isValidToken) {
      return <p>❌ Reset link is invalid or expired.</p>;
    }
    return (
      <form onSubmit={handleApply} className="reset-form" aria-label="Set New Password Form">
        <h2>🔐 Set New Password</h2>
        <p>Resetting password for: <strong>{verifiedEmail}</strong></p>

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
  }

  // ✅ Request mode
  return (
    <form onSubmit={handleRequest} className="reset-form" aria-label="Request Reset Form">
      <h2>🔐 Reset Password</h2>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="username"
        disabled={loading}
      />
      <button type="submit" disabled={loading}>
        {loading ? "Sending..." : "Send Reset Email"}
      </button>
    </form>
  );
};

export default ResetPassword;
