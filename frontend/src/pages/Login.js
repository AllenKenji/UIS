import React, { useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { auth, db } from "../services/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-toastify";
import "./login.css";

const roleRedirects = {
  admin: "/admin",
  staff: "/staff",
  resident: "/resident",
  secretary: "/secretary",
  treasurer: "/treasurer",
  sk: "/youth",
  dilg: "/audit",
};

const normalizeRole = (role) => {
  const normalized = role?.trim().toLowerCase();
  return normalized || "resident";
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const validateInputs = () => {
    if (!email.includes("@") || password.length < 6) {
      toast.error("❌ Invalid email or password format");
      return false;
    }
    return true;
  };

  const cacheUser = (userData, uid, role) => {
    const enriched = { ...userData, uid, role, cachedAt: Date.now() };
    sessionStorage.setItem("userInfo", JSON.stringify(enriched));
    return enriched;
  };

  const redirectByRole = (role) => {
    const target = roleRedirects[normalizeRole(role)] || "/unauthorized";
    navigate(target, { replace: true });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!validateInputs()) return;

    setLoading(true);
    try {
      await setPersistence(auth, browserSessionPersistence);
      const { user } = await signInWithEmailAndPassword(auth, email, password);

      await user.getIdToken(true);

      const tokenResult = await user.getIdTokenResult();
      let role = normalizeRole(tokenResult.claims.role);

      let userData = null;
      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        userData = userDoc.data();
        role = normalizeRole(userData.role || role);
      } else {
        const residentDocRef = doc(db, "residents", user.uid);
        const residentDoc = await getDoc(residentDocRef);
        if (residentDoc.exists()) {
          userData = residentDoc.data();
          role = "resident";
        }
      }

      if (!userData) {
        console.warn("❌ No profile found for UID:", user.uid);
        toast.error("❌ Unauthorized account. Contact admin.");
        return;
      }

      cacheUser(userData, user.uid, role);

      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

      toast.success(`✅ Welcome, ${userData.fullName || email}`);
      redirectByRole(role);
    } catch (error) {
      console.error("❌ Login error:", error);
      switch (error.code) {
        case "auth/wrong-password":
        case "auth/user-not-found":
          toast.error("❌ Invalid credentials");
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

        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            placeholder="admin@barangay.gov.ph"
            disabled={loading}
          />
        </div>

        <div className="form-group password-group">
          <label htmlFor="password">Password</label>
          <div className="password-wrapper">
            <input
              id="password"
              name="password"
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

        <button type="submit" className="login-button" disabled={loading}>
          {loading ? "Logging in…" : "Login"}
        </button>
      </form>
    </div>
  );
};

export default Login;
