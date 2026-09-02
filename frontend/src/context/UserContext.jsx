import { createContext, useState, useEffect, useContext, useCallback } from "react";
import { flushSync } from "react-dom";
import { ROLE_PERMISSIONS, VALID_ROLES } from "../config/roles";
import { AuthAPI, NotificationsAPI } from "../services/api";

const UserContext = createContext();
const DEBUG = !import.meta.env.PROD;

const normalizeRole = (role) => {
  const normalized = role?.trim().toLowerCase();
  return normalized && VALID_ROLES.includes(normalized) ? normalized : null;
};

const decodeToken = (token) => {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(window.atob(payload));
  } catch {
    return null;
  }
};

export const UserProvider = ({ children }) => {
  const [userInfo, setUserInfo] = useState(null);
  const [role, setRole] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error] = useState(null);
  const [token, setToken] = useState(null);
  const isAdmin = role === "admin";
  const isSuperAdmin = role === "super_admin";

  const can = useCallback((action) => isSuperAdmin || Boolean((ROLE_PERMISSIONS[role] || {})[action]), [role, isSuperAdmin]);
  const hasAccess = useCallback(
    (allowedRoles = [], allowAdminOverride = true) => isSuperAdmin || allowedRoles.includes(role) || (allowAdminOverride && isAdmin),
    [role, isAdmin, isSuperAdmin]
  );

  const updateUserInfo = useCallback((info) => {
    const enriched = { ...info, cachedAt: Date.now() };
    setUserInfo(enriched);
    sessionStorage.setItem("userInfo", JSON.stringify(enriched));
  }, []);

  const setSession = useCallback((info, authToken) => {
    const effectiveRole = normalizeRole(info?.role);
    const enriched = { ...info, role: effectiveRole, cachedAt: Date.now() };
    setUserInfo(enriched);
    setRole(effectiveRole);
    setToken(authToken);
    setIsAuthenticated(true);
    sessionStorage.setItem("userInfo", JSON.stringify(enriched));
    sessionStorage.setItem("authToken", authToken);
  }, []);

  const clearUserState = useCallback(() => {
    setUserInfo(null);
    setRole(null);
    setToken(null);
    setIsAuthenticated(false);
    sessionStorage.removeItem("userInfo");
    sessionStorage.removeItem("authToken");
  }, []);

  const getToken = useCallback(async () => {
    const current = sessionStorage.getItem("authToken");
    setToken(current);
    return current;
  }, []);

  const getTokenResult = useCallback(async () => {
    const current = sessionStorage.getItem("authToken");
    const claims = current ? decodeToken(current) : null;
    return claims ? { claims } : null;
  }, []);

  const switchRole = useCallback(async (nextRole) => {
    const response = await AuthAPI.switchRole(nextRole);
    flushSync(() => {
      setSession({ ...response.user, role: nextRole }, response.accessToken);
    });
    return response.user;
  }, [setSession]);

  const logout = useCallback(async (options = {}) => {
    const roleCandidate = (options.role || role || userInfo?.role || "officer").toString().toLowerCase();
    const nameCandidate = options.name || userInfo?.fullName || userInfo?.full_name || userInfo?.email || "Officer";
    try {
      if (roleCandidate === "resident") await NotificationsAPI.createResidentLogOut(1);
      else await NotificationsAPI.createOfficerLogOut(nameCandidate, roleCandidate);
    } catch (notificationError) {
      if (DEBUG) console.warn("Logout notification failed", notificationError);
    }
    clearUserState();
  }, [clearUserState, role, userInfo]);

  useEffect(() => {
    const storedToken = sessionStorage.getItem("authToken");
    const storedUser = sessionStorage.getItem("userInfo");
    const claims = storedToken ? decodeToken(storedToken) : null;
    const parsed = storedUser ? JSON.parse(storedUser) : null;
    const effectiveRole = normalizeRole(parsed?.role || claims?.role);
    if (storedToken && parsed && effectiveRole && (!claims?.exp || claims.exp * 1000 > Date.now())) {
      setToken(storedToken);
      setUserInfo(parsed);
      setRole(effectiveRole);
      setIsAuthenticated(true);
    } else {
      clearUserState();
    }
    setLoading(false);
  }, [clearUserState]);

  const refreshProfile = useCallback(async () => {
    const stored = sessionStorage.getItem("userInfo");
    if (stored) updateUserInfo(JSON.parse(stored));
  }, [updateUserInfo]);

  return (
    <UserContext.Provider value={{ userInfo, role, isAuthenticated, isAdmin, isSuperAdmin, loading, error, logout, getToken, getTokenResult, hasAccess, can, updateUserInfo, setSession, switchRole, refreshProfile, token }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within a UserProvider");
  return context;
};
