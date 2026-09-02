import { useEffect, useState, useCallback } from "react";
import { AccountsAPI, RolesAPI, api } from "../../services/api";
import { uploadLocalFile } from "../../utils/fileUtils";
import { useUser } from "../../context/UserContext";
import { ROLE_OPTIONS } from "../../config/roles";
import "../../styles/dashboard/role-manager.css";

const PRESENCE_POLL_MS = 3000;

const RoleManager = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState(null);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [userPresence, setUserPresence] = useState({});
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "" });
  const [editPhoto, setEditPhoto] = useState(null);
  const [editRoles, setEditRoles] = useState([]);
  const [savingProfile, setSavingProfile] = useState(false);

  const { userInfo, isAdmin, can } = useUser();
  const hasManagePermission = isAdmin || can("manageUsers"); 

  const fetchUserPresence = useCallback(async () => {
    if (!hasManagePermission) return;

    try {
      const { data } = await api.get("/api/ws/presence/users");
      setUserPresence(data?.users || {});
    } catch (err) {
      console.warn("⚠️ Failed to load user presence:", err?.message || err);
      setUserPresence({});
    }
  }, [hasManagePermission]);

  // 🔍 Fetch users (only if allowed)
  const fetchUsers = useCallback(async () => {
    if (!hasManagePermission) {
      setError("❌ You do not have permission to view users.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const accounts = await AccountsAPI.list({ limit: 100 });
      const data = (Array.isArray(accounts) ? accounts : []).map((account) => {
        const role = account.role?.trim().toLowerCase();
        if (!ROLE_OPTIONS.some((opt) => opt.value === role)) {
          console.warn(
            `⚠️ Unknown role "${role}" for UID ${account.uid}, defaulting to resident`
          );
        }
        return {
          id: account.uid,
          ...account,
          role: ROLE_OPTIONS.some((opt) => opt.value === role)
            ? role
            : "resident", // normalize + validate
        };
      });
      setUsers(data);
      setError(null);
      await fetchUserPresence();
    } catch (err) {
      console.error("❌ Failed to load users:", err);
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [hasManagePermission, fetchUserPresence]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!hasManagePermission) return;

    const interval = setInterval(() => {
      fetchUserPresence();
    }, PRESENCE_POLL_MS);

    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchUserPresence();
      }
    };

    const refreshOnFocus = () => {
      fetchUserPresence();
    };

    document.addEventListener("visibilitychange", refreshOnVisibility);
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [hasManagePermission, fetchUserPresence]);

  // 🔧 Unified safe API call
  const safeApiCall = useCallback(
    async (context, apiFunc, rollback, ...args) => {
      try {
        setPendingUserId(args[0]); // assume first arg is userId
        
      
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
    []
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

  const getUserOnline = (uid) => Boolean(userPresence?.[uid]?.online);

  const bootstrapAdmin = async () => {
    try { 
      const result = await RolesAPI.assignRole(userInfo.uid, "admin"); 
      setFeedback(`✅ Role '${result.role}' assigned to your account`); 
    } catch (err) { 
      console.error("❌ Failed to assign admin role:", err); 
      setFeedback("❌ Failed to assign admin role"); 
    } 
  };

  const openProfileEditor = (user) => {
    setEditingUser(user);
    setEditForm({ full_name: user.full_name || "", email: user.email || "" });
    setEditRoles(user.roles?.length ? user.roles : [user.role]);
    setEditPhoto(null);
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    if (!editingUser) return;
    setSavingProfile(true);
    try {
      const data = await AccountsAPI.updateProfile(editingUser.id, editForm);
      const rolesResult = await AccountsAPI.updateRoles(editingUser.id, editRoles);
      let photoUrl = editingUser.photo_url;
      if (editPhoto) {
        const extension = editPhoto.name.split(".").pop() || "jpg";
        const uploaded = await uploadLocalFile(editingUser.id, editPhoto, `accounts/${editingUser.id}/photo`, `profile.${extension}`);
        const photoResponse = await AccountsAPI.updatePhoto(editingUser.id, uploaded.url);
        photoUrl = photoResponse.photoUrl;
      }
      setUsers((current) => current.map((user) => user.id === editingUser.id ? { ...user, ...data, ...rolesResult, photo_url: photoUrl } : user));
      setFeedback("✅ Profile updated");
      setEditingUser(null);
    } catch (error) {
      setFeedback(`❌ Failed to update profile: ${error.response?.data?.detail || error.message}`);
    } finally {
      setSavingProfile(false);
    }
  };

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
              <th>Photo</th>
              <th>Name</th>
              <th>Current Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedUsers.map((user) => (
              <tr
                key={user.id}
                className={pendingUserId === user.id ? "pending-row" : ""}
              >
                <td>{user.photo_url ? <img className="role-profile-photo" src={user.photo_url} alt="" /> : <span className="role-profile-placeholder">{(user.full_name || "?").charAt(0)}</span>}</td>
                <td>{user.full_name || "Unnamed User"}<small className="role-email">{user.email}</small></td>
                <td>
                  <span className={`role-badge ${user.role}`}>{user.role}</span>
                </td>
                <td>
                  <span className="presence-indicator" title={getUserOnline(user.id) ? "Online" : "Offline"}>
                    <span
                      className={`presence-dot ${getUserOnline(user.id) ? "online" : "offline"}`}
                      aria-label={getUserOnline(user.id) ? "Online" : "Offline"}
                    />
                  </span>
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
                  {user.id === userInfo?.uid && user.role !== "admin" && (
                    <button onClick={bootstrapAdmin}>
                      🚀 Bootstrap My Admin Role
                    </button>
                  )}
                  <button
                    onClick={() => openProfileEditor(user)}
                    disabled={!hasManagePermission || pendingUserId === user.id}
                  >
                    ✏️ Edit
                  </button>
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
      {editingUser && (
        <div className="role-editor-overlay" role="dialog" aria-modal="true" aria-label="Edit account profile">
          <form className="role-editor" onSubmit={saveProfile}>
            <h3>Edit Account Profile</h3>
            <label>Full Name<input value={editForm.full_name} onChange={(event) => setEditForm((current) => ({ ...current, full_name: event.target.value }))} required /></label>
            <label>Email<input type="email" value={editForm.email} onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))} required /></label>
            <fieldset className="role-editor-roles"><legend>Assigned Roles</legend>{ROLE_OPTIONS.map((option) => <label key={option.value}><input type="checkbox" checked={editRoles.includes(option.value)} onChange={(event) => setEditRoles((current) => event.target.checked ? [...current, option.value] : current.filter((role) => role !== option.value))} disabled={option.value === "admin" && editingUser.id === userInfo?.uid} /> {option.label}</label>)}</fieldset>
            <label>Replace Profile Photo <span>(optional)</span><input type="file" accept="image/*" onChange={(event) => setEditPhoto(event.target.files?.[0] || null)} /></label>
            <div className="role-editor-actions"><button type="submit" disabled={savingProfile}>{savingProfile ? "Saving..." : "Save Changes"}</button><button type="button" onClick={() => setEditingUser(null)} disabled={savingProfile}>Cancel</button></div>
          </form>
        </div>
      )}
    </section>
  );
};

export default RoleManager;
