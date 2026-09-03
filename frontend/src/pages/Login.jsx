import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-toastify";
import { api } from "../services/api";
import { NotificationsAPI } from "../services/api"; // 👈 import
import { useUser } from "../context/UserContext";
import "./login.css";

const roleRedirects = {
  super_admin: "/super-admin",
  admin: "/admin",
  staff: "/staff",
  resident: "/resident",
  secretary: "/secretary",
  treasurer: "/treasurer",
  sk: "/youth",
  dilg: "/audit",
  surveyor: import.meta.env.VITE_FDP_SURVEY_URL || "/fdp-survey",
  supervisor: import.meta.env.VITE_FDP_SURVEY_URL || "/fdp-survey",
};

const normalizeRole = (role) => (role?.trim().toLowerCase() || "resident");

const getDisplayName = (profile = {}, fallbackEmail = "") => {
  const firstLast = [profile.firstName || profile.first_name, profile.lastName || profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    profile.fullName ||
    profile.full_name ||
    profile.name ||
    firstLast ||
    fallbackEmail
  );
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { setSession } = useUser();

  // Load remembered email
  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const validateInputs = () => {
    const identifier = email.trim();
    if ((!identifier.includes("@") && !/^09\d{9}$/.test(identifier)) || password.length < 6) {
      toast.error("❌ Enter a valid email address or Philippine mobile number, and password.");
      return false;
    }
    return true;
  };

  const redirectByRole = (role) => {
    const target = roleRedirects[normalizeRole(role)] || "/unauthorized";
    if (/^https?:\/\//i.test(target)) {
      window.location.assign(target);
      return;
    }

    navigate(target, { replace: true });
  };

 

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!validateInputs()) return;

    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/login", { email: email.trim(), password });
      const userData = data?.user;
      if (!userData || !data?.accessToken) {
        throw new Error("Login response is incomplete");
      }
      const role = normalizeRole(userData.role);
      setSession({ ...userData, role }, data.accessToken);

      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

      // Do not block login on telemetry/notification failures.
      try {
        if (role === "resident") {
          await NotificationsAPI.createResidentLogin(1);
        } else {
          const officerName = getDisplayName(userData, email);
          await NotificationsAPI.createOfficerLogin(officerName, role);
        }
      } catch (notifyErr) {
        console.warn("Notification logging failed, continuing login:", notifyErr);
      }

      if (role === "surveyor" || role === "supervisor") {
        try {
          const { data } = await api.post("/api/internal/fdp/survey-handoff");
          if (data?.redirectUrl) {
            window.location.assign(data.redirectUrl);
            return;
          }
        } catch (handoffErr) {
          console.warn("Survey handoff failed, falling back to BIS redirect:", handoffErr);
        }
      }

      toast.success(`✅ Welcome, ${getDisplayName(userData, email)}`);
      redirectByRole(role);
    } catch (error) {
      console.error("❌ Login error:", error);
      switch (error.response?.status || error.code) {
        case 401:
        case "auth/wrong-password":
        case "auth/user-not-found":
          toast.error("❌ Invalid credentials");
          break;
        case "auth/too-many-requests":
          toast.error("❌ Too many attempts. Try again later.");
          break;
        case "permission-denied":
          toast.error("❌ Access denied. Contact admin.");
          break;
        default:
          toast.error("❌ Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="login-container">
      <form
        onSubmit={handleLogin}
        className="login-form"
        aria-label="Login Form"
        aria-busy={loading}
      >
        <h2>🔐 Barangay Login</h2>

        {/* Email */}
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            placeholder="admin@barangay.gov.ph"
            disabled={loading}
          />
        </div>

        {/* Password */}
        <div className="form-group password-group">
          <label htmlFor="password">Password</label>
          <div className="password-wrapper">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              disabled={loading}
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword(!showPassword)}
              disabled={loading}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        {/* Options */}
        <div className="form-options">
          <label className="remember-me">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={() => setRememberMe(!rememberMe)}
              disabled={loading}
            />
            Remember Me
          </label>
          <div className="forgot-password">
            <Link to="/reset-password">Forgot Password?</Link>
          </div>
        </div>

        {/* Submit */}
        <button type="submit" className="login-button" disabled={loading}>
          {loading ? "Logging in…" : "Login"}
        </button>
      </form>
    </div>
  );
};

export default Login;
