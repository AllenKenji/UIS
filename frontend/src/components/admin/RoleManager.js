// frontend/src/components/dashboard/RoleManager.js

import React, { useEffect, useState, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "../../services/firebase";
import { AccountsAPI, setAuthToken } from "../../services/api";
import { useUser } from "../../context/UserContext";
import { ROLE_OPTIONS } from "../../config/roles";
import "../../styles/dashboard/role-manager.css";

const RoleManager = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(null);
  const [pendingUserId, setPendingUserId] = useState(null);

  const { userInfo, isAdmin, can, getToken } = useUser();
  const hasManagePermission = isAdmin || can("manageUsers"); // ✅ aligned with role_permissions.json

  // 🔍 Fetch users (only if allowed)
  const fetchUsers = useCallback(async () => {
    if (!hasManagePermission) {
      setError("❌ You do not have permission to view users.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Force token refresh to ensure latest claims
      await auth.currentUser?.getIdToken(true);

      const snapshot = await getDocs(collection(db, "users"));
      const data = snapshot.docs.map((doc) => {
        const role = doc.data().role?.trim().toLowerCase();
        if (!ROLE_OPTIONS.some((opt) => opt.value === role)) {
          console.warn(
            `⚠️ Unknown role "${role}" for UID ${doc.id}, defaulting to resident`
          );
        }
        return {
          id: doc.id,
          ...doc.data(),
          role: ROLE_OPTIONS.some((opt) => opt.value === role)
            ? role
            : "resident", // normalize + validate
        };
      });
      setUsers(data);
      setError(null);
    } catch (err) {
      console.error("❌ Failed to load users:", err);
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [hasManagePermission]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // 🔧 Unified safe API call
  const safeApiCall = useCallback(
    async (context, apiFunc, rollback, ...args) => {
      try {
        setPendingUserId(args[0]); // assume first arg is userId
        const token = await getToken();
        setAuthToken(token);
        const result = await apiFunc(...args);
        setFeedback(`✅ ${context} succeeded`);
        return result;
      } catch (err) {
        console.error(`❌ ${context} error:`, err);
        if (rollback) rollback();
        setFeedback(`❌ Failed to ${context.toLowerCase()}`);
        return null;
      } finally {
        setPendingUserId(null);
      }
    },
    [getToken]
  );

  // 🔧 Handle role change
  const handleRoleChange = useCallback(
    async (userId, newRole) => {
      if (userId === userInfo?.uid && newRole !== "admin") {
        setFeedback("⚠️ You cannot downgrade your own role.");
        return;
      }
      if (!hasManagePermission) {
        setFeedback("❌ You do not have permission to change roles.");
        return;
      }

      const prevUsers = [...users];
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );

      const updatedAccount = await safeApiCall(
        "update role",
        AccountsAPI.updateRole,
        () => setUsers(prevUsers),
        userId,
        newRole
      );

      if (updatedAccount) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, ...updatedAccount } : u))
        );
      }
    },
    [userInfo, hasManagePermission, users, safeApiCall]
  );

  // 🔧 Handle delete
  const handleDeleteUser = useCallback(
    async (userId) => {
      if (userId === userInfo?.uid) {
        setFeedback("⚠️ You cannot delete your own account.");
        return;
      }
      if (!hasManagePermission) {
        setFeedback("❌ You do not have permission to delete users.");
        return;
      }
      if (!window.confirm("Are you sure you want to delete this user?")) {
        return;
      }

      const prevUsers = [...users];
      setUsers((prev) => prev.filter((u) => u.id !== userId));

      await safeApiCall(
        "delete user",
        AccountsAPI.delete,
        () => setUsers(prevUsers),
        userId
      );
    },
    [userInfo, hasManagePermission, users, safeApiCall]
  );

  // 🔧 Auto-clear feedback
  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => setFeedback(""), 5000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const sortedUsers = [...users].sort(
    (a, b) =>
      a.role.localeCompare(b.role) ||
      (a.full_name || "").localeCompare(b.full_name || "")
  );

  return (
    <section className="role-manager" aria-busy={loading} aria-live="polite">
      <h3>🛂 Role Manager</h3>
      {feedback && <p className="feedback">{feedback}</p>}
      <button onClick={fetchUsers} disabled={loading || !hasManagePermission}>
        🔄 Refresh Users
      </button>
      {loading ? (
        <p>Loading users...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : users.length === 0 ? (
        <p>No users available for your role.</p>
      ) : (
        <table className="role-table" aria-label="User Role Table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Current Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr
                key={user.id}
                className={pendingUserId === user.id ? "pending-row" : ""}
              >
                <td>{user.full_name || "Unnamed User"}</td>
                <td>
                  <span className={`role-badge ${user.role}`}>{user.role}</span>
                </td>
                <td>
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    aria-label={`Change role for ${user.full_name || "user"}`}
                    disabled={!hasManagePermission || pendingUserId === user.id}
                  >
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDeleteUser(user.id)}
                    disabled={!hasManagePermission || pendingUserId === user.id}
                    className="delete-btn danger"
                  >
                    🗑️ Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
};

export default RoleManager;
