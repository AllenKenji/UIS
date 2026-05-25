// context/UserContext.js
import {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
} from "react";
import {
  onAuthStateChanged,
  signOut,
  getIdToken,
  getIdTokenResult,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { ROLE_PERMISSIONS, VALID_ROLES } from "../config/roles";
import { NotificationsAPI, API_BASE_URL } from "../services/api";

const UserContext = createContext();
const DEBUG = process.env.NODE_ENV !== "production";
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes
const LOGOUT_BEACON_DEDUPE_MS = 15000;
const LAST_LOGOUT_NOTIFY_KEY = "lastLogoutNotifiedAt";

// ✅ Normalize role safely
const normalizeRole = (role) => {
  const normalized = role?.trim().toLowerCase();
  if (!normalized || !VALID_ROLES.includes(normalized)) {
    if (DEBUG) console.warn(`⚠️ Unknown or missing role "${role}"`);
    return null; // invalid role → unauthorized
  }
  return normalized;
};

export const UserProvider = ({ children }) => {
  const [userInfo, setUserInfo] = useState(null);
  const [role, setRole] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(null);

  const isAdmin = role === "admin";

  // ✅ Permission checks
  const can = useCallback(
    (action) => {
      const rolePerms = ROLE_PERMISSIONS[role] || {};
      const allowed = Boolean(rolePerms[action]);
      const actionExists = Object.prototype.hasOwnProperty.call(rolePerms, action);

      if (DEBUG && !allowed && actionExists && role !== "resident") {
        console.warn(`🚫 Role "${role}" lacks permission for "${action}"`);
      }
      return allowed;
    },
    [role]
  );

  const hasAccess = useCallback(
    (allowedRoles = [], allowAdminOverride = true) =>
      allowedRoles.includes(role) || (allowAdminOverride && isAdmin),
    [role, isAdmin]
  );

  const updateUserInfo = useCallback((info) => {
    const enriched = { ...info, cachedAt: Date.now() };
    setUserInfo(enriched);
    sessionStorage.setItem("userInfo", JSON.stringify(enriched));
  }, []);

  const updateRole = useCallback((newRole) => {
    setRole(normalizeRole(newRole));
  }, []);

  const clearUserState = useCallback(() => {
    setUserInfo(null);
    setRole(null);
    setIsAuthenticated(false);
    setError(null);
    sessionStorage.removeItem("userInfo");
    sessionStorage.removeItem("authToken");
  }, []);

  // ✅ Error helper
  const safeSetError = (msg) => {
    setError(msg);
    setTimeout(() => setError(null), 5000);
  };

  const markLogoutNotifiedNow = () => {
    try {
      sessionStorage.setItem(LAST_LOGOUT_NOTIFY_KEY, String(Date.now()));
    } catch {
      // no-op
    }
  };

  const wasLogoutRecentlyNotified = () => {
    try {
      const last = Number(sessionStorage.getItem(LAST_LOGOUT_NOTIFY_KEY) || 0);
      return Number.isFinite(last) && Date.now() - last < LOGOUT_BEACON_DEDUPE_MS;
    } catch {
      return false;
    }
  };

  // ✅ Token helpers
  const getToken = useCallback(async (forceRefresh = true) => {
    if (!auth.currentUser) return null;
    try {
      const freshToken = await getIdToken(auth.currentUser, forceRefresh);
      sessionStorage.setItem("authToken", freshToken);
      setToken(freshToken);
      return freshToken;
    } catch (err) {
      console.error("❌ Failed to get ID token:", err);
      safeSetError("Token retrieval failed");
      const cached = sessionStorage.getItem("authToken");
      return cached || null;
    }
  }, []);

  const getTokenResult = useCallback(async (forceRefresh = false) => {
    if (!auth.currentUser) return null;
    try {
      return await getIdTokenResult(auth.currentUser, forceRefresh);
    } catch (err) {
      console.error("❌ Failed to get ID token result:", err);
      safeSetError("Token result retrieval failed");
      return null;
    }
  }, []);

  const logout = useCallback(async (options = {}) => {
    const roleCandidate = (options.role || role || userInfo?.role || "officer").toString().trim().toLowerCase();
    const nameCandidate =
      options.name ||
      userInfo?.fullName ||
      userInfo?.full_name ||
      userInfo?.name ||
      userInfo?.email ||
      auth.currentUser?.email ||
      "Officer";

    try {
      if (roleCandidate === "resident") {
        await NotificationsAPI.createResidentLogOut(1);
      } else {
        try {
          await NotificationsAPI.createOfficerLogOut(nameCandidate, roleCandidate);
        } catch (officerError) {
          await NotificationsAPI.createSelfLogOut(nameCandidate, roleCandidate, 1);
          if (DEBUG) {
            console.warn("⚠️ officer-logout failed, used logout-self fallback:", officerError);
          }
        }
      }
      markLogoutNotifiedNow();
    } catch (notificationError) {
      if (DEBUG) {
        console.error("⚠️ Logout notification failed:", notificationError);
      }
    }

    clearUserState();
    try {
      await signOut(auth);
    } catch (err) {
      console.error("❌ Sign-out failed:", err);
      safeSetError("Sign-out failed");
    }
  }, [clearUserState, role, userInfo]);

  useEffect(() => {
    const handlePageLeave = () => {
      if (!isAuthenticated || wasLogoutRecentlyNotified()) {
        return;
      }

      const roleCandidate = normalizeRole(role || userInfo?.role);
      if (!roleCandidate) {
        return;
      }

      const tokenValue = sessionStorage.getItem("authToken");
      if (!tokenValue) {
        return;
      }

      const endpoint = roleCandidate === "resident"
        ? `${API_BASE_URL}/api/notifications/resident-logout`
        : `${API_BASE_URL}/api/notifications/logout-self`;

      const payload = roleCandidate === "resident"
        ? { count: 1 }
        : {
            count: 1,
            role: roleCandidate,
            name:
              userInfo?.fullName ||
              userInfo?.full_name ||
              userInfo?.name ||
              userInfo?.email ||
              "Officer",
          };

      try {
        fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenValue}`,
          },
          body: JSON.stringify(payload),
          keepalive: true,
        });
        markLogoutNotifiedNow();
      } catch {
        // Intentionally swallow errors during unload/pagehide.
      }
    };

    window.addEventListener("pagehide", handlePageLeave);
    window.addEventListener("beforeunload", handlePageLeave);

    return () => {
      window.removeEventListener("pagehide", handlePageLeave);
      window.removeEventListener("beforeunload", handlePageLeave);
    };
  }, [isAuthenticated, role, userInfo]);

  // ✅ Fetch profile from users/{uid} or residents/{uid}
  const fetchUserProfile = useCallback(async (uid) => {
    try {
      let ref = doc(db, "users", uid);
      let snapshot = await getDoc(ref);

      if (!snapshot.exists()) {
        ref = doc(db, "residents", uid);
        snapshot = await getDoc(ref);
      }

      if (!snapshot.exists()) {
        console.warn("⚠️ No Firestore profile found for UID:", uid);
        return null;
      }

      return { ...snapshot.data(), uid };
    } catch (err) {
      console.error("❌ Error fetching user profile:", err);
      safeSetError("Failed to load user profile");
      return null;
    }
  }, []);

  // ✅ Restore session from cache with expiry
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("userInfo");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.cachedAt && Date.now() - parsed.cachedAt < CACHE_TTL) {
          setUserInfo(parsed);
          setRole(normalizeRole(parsed.role));
          setIsAuthenticated(true);
        }
      }
    } catch (err) {
      console.warn("⚠️ Failed to hydrate session cache:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ✅ Main auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (!loading) clearUserState();
        setLoading(false);
        return;
      }

      try {
        const tokenResult = await getIdTokenResult(user, true);
        const claimRole = tokenResult.claims.role
          ? normalizeRole(tokenResult.claims.role)
          : null;

        const profile = await fetchUserProfile(user.uid);
        const effectiveRole = claimRole || normalizeRole(profile?.role);

        if (!effectiveRole) {
          clearUserState();
          safeSetError("Unauthorized role");
          setLoading(false);
          return;
        }

        const enriched = { ...(profile || {}), uid: user.uid, role: effectiveRole };
        updateRole(effectiveRole);
        updateUserInfo(enriched);
        setIsAuthenticated(true);
        setError(null);

        const freshToken = await getToken(true);
        setToken(freshToken);
      } catch (err) {
        console.error("❌ Error during auth state handling:", err);
        safeSetError("Authentication error");
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchUserProfile, clearUserState, updateRole, updateUserInfo, getToken, loading]);

  // ✅ Token auto-refresh every 55 minutes
  useEffect(() => {
    if (!auth.currentUser) return;
    const interval = setInterval(() => {
      getToken(true);
    }, 55 * 60 * 1000);
    return () => clearInterval(interval);
  }, [getToken]);

  // ✅ Safety timeout
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn("⏳ Timeout: forcing loading to false");
        setLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timeout);
  }, [loading]);

  // ✅ Manual refresh
  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    const profile = await fetchUserProfile(auth.currentUser.uid);
    if (profile) {
      updateUserInfo(profile);
      updateRole(profile.role);
    }
  }, [fetchUserProfile, updateUserInfo, updateRole]);

  return (
    <UserContext.Provider
      value={{
        userInfo,
        role,
        isAuthenticated,
        isAdmin,
        loading,
        error,
        logout,
        getToken,
        getTokenResult,
        hasAccess,
        can,
        updateUserInfo,
        updateRole,
        refreshProfile,
        token,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within a UserProvider");
  return context;
};
