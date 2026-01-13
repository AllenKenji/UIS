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

const UserContext = createContext();
const DEBUG = true;

// ✅ Normalize role safely
const normalizeRole = (role) => {
  const normalized = role?.trim().toLowerCase();
  if (!normalized || !VALID_ROLES.includes(normalized)) {
    if (DEBUG) console.warn(`⚠️ Unknown or missing role "${role}", defaulting to resident`);
    return "resident";
  }
  return normalized;
};

export const UserProvider = ({ children }) => {
  const [userInfo, setUserInfo] = useState(null);
  const [role, setRole] = useState("resident");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isAdmin = role === "admin";

  // ✅ Permission checks
  const can = useCallback(
    (action) => {
      const rolePerms = ROLE_PERMISSIONS[role] || {};
      const allowed = Boolean(rolePerms[action]);

      // ✅ Only warn if the action is defined for this role but set to false
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
    setUserInfo(info);
    sessionStorage.setItem("userInfo", JSON.stringify(info));
  }, []);

  const updateRole = useCallback((newRole) => {
    setRole(normalizeRole(newRole));
  }, []);

  const clearUserState = useCallback(() => {
    setUserInfo(null);
    setRole("resident");
    setIsAuthenticated(false);
    setError(null);
    sessionStorage.removeItem("userInfo");
  }, []);

  // ✅ Token helpers
  const getToken = useCallback(async (forceRefresh = false) => {
    if (!auth.currentUser) return null;
    try {
      return await getIdToken(auth.currentUser, forceRefresh);
    } catch (err) {
      console.error("❌ Failed to get ID token:", err);
      setError("Token retrieval failed");
      return null;
    }
  }, []);

  const getTokenResult = useCallback(async (forceRefresh = false) => {
    if (!auth.currentUser) return null;
    try {
      return await getIdTokenResult(auth.currentUser, forceRefresh);
    } catch (err) {
      console.error("❌ Failed to get ID token result:", err);
      setError("Token result retrieval failed");
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    clearUserState();
    try {
      await signOut(auth);
    } catch (err) {
      console.error("❌ Sign-out failed:", err);
      setError("Sign-out failed");
    }
  }, [clearUserState]);

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

      return { ...snapshot.data(), uid, cachedAt: Date.now() };
    } catch (err) {
      console.error("❌ Error fetching user profile:", err);
      setError("Failed to load user profile");
      return null;
    }
  }, []);

  // ✅ Restore session from cache
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem("userInfo");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.role) {
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
        clearUserState();
        setLoading(false);
        return;
      }

      try {
        const tokenResult = await getIdTokenResult(user, true);
        const claimRole = tokenResult.claims.role
          ? normalizeRole(tokenResult.claims.role)
          : null;

        const profile = await fetchUserProfile(user.uid);

        // ✅ Determine role safely
        let effectiveRole = claimRole;
        if (!effectiveRole && profile?.role) {
          effectiveRole = normalizeRole(profile.role);
        }
        if (!effectiveRole) {
          effectiveRole = "resident";
        }

        if (DEBUG) {
          console.debug("🔍 Token claims:", tokenResult.claims);
          console.debug("👤 Firestore profile:", profile);
          console.debug("🎭 Effective role:", effectiveRole);
        }

        const enriched = { ...(profile || {}), uid: user.uid, role: effectiveRole };

        updateRole(effectiveRole);
        updateUserInfo(enriched);
        setIsAuthenticated(true);
        setError(null);
      } catch (err) {
        console.error("❌ Error during auth state handling:", err);
        // ✅ Do NOT log out the user on transient errors
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchUserProfile, clearUserState, updateRole, updateUserInfo]);

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
