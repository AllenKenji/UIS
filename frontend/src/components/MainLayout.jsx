import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { useTheme } from "../context/ThemeContext";
import SecureNavLink from "./auth/SecureNavLink";
import NotificationBell from "../components/NotificationBell";
import { useNotifications } from "../context/NotificationContext";
import { MessagesAPI } from "../services/api";
import { formatPhilippineDateTime } from "../utils/dateTime";
import { useEffect, useState } from "react";
import sidebarLinks from "../config/navigation";
import "./main-layout.css";

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userInfo, role, logout, switchRole } = useUser();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const {
    notifications,
    unreadCount,
    markAsRead,
    deleteNotification,
    bulkDeleteNotifications,
  } = useNotifications();

  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const roleDashboardPaths = {
    admin: "/admin",
    staff: "/staff",
    resident: "/resident",
    secretary: "/secretary",
    treasurer: "/treasurer",
    sk: "/youth",
    dilg: "/audit",
    surveyor: "/fdp-survey",
    supervisor: "/fdp-survey",
  };

  useEffect(() => {
    document.body.classList.add("dashboard-scroll-lock");
    return () => {
      document.body.classList.remove("dashboard-scroll-lock");
    };
  }, []);

  useEffect(() => {
    if (!role || role === "resident") return;
    // userInfo.roles is only ever set at login/switch-role time and then
    // cached (see UserContext.setSession) — if an admin grants this account
    // another role while it's already logged in, the role-switcher below
    // would never show it without this. switchRole(role) is a no-op switch
    // (same role in, same role out) whose only purpose here is to re-fetch
    // the account's current `roles` from Firestore and refresh the cache.
    switchRole(role).catch(() => {
      // Non-fatal — worst case the newly granted role only shows up after
      // the next full login.
    });
    // Intentionally once per mount, not on every `role` change (switchRole
    // itself changes `role`, which would otherwise loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    const refreshUnreadMessages = async () => {
      try {
        const conversations = await MessagesAPI.conversations();
        if (active) setUnreadMessages(conversations.reduce((total, item) => total + (item.unreadCount || 0), 0));
      } catch {
        if (active) setUnreadMessages(0);
      }
    };
    refreshUnreadMessages();
    const interval = setInterval(refreshUnreadMessages, 30000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  const normalizedRole = role?.trim().toLowerCase();
  const isSkModuleRoute = normalizedRole === "sk" && location.pathname.startsWith("/youth");
  const linksToRender = isSkModuleRoute
    ? sidebarLinks.sk || []
    : sidebarLinks[normalizedRole] || sidebarLinks.default || [];

  const handleBellClick = () => {
    setShowNotifications((prev) => !prev);
  };

  const handleRoleSwitch = async (event) => {
    const nextRole = event.target.value;
    if (nextRole === role) return;
    try {
      await switchRole(nextRole);
      navigate(roleDashboardPaths[nextRole] || "/", { replace: true });
    } catch (error) {
      console.error("Role switch failed:", error);
    }
  };

  const handleLogout = async () => {
    const logoutRole = (normalizedRole || userInfo?.role || "officer").toString().trim().toLowerCase();
    const logoutName = userInfo?.fullName || userInfo?.full_name || userInfo?.name || userInfo?.email || "Officer";

    try {
      // Leave the protected route before clearing auth state — logout() awaits a
      // notification call first, and that extra microtask gap gives ProtectedRoute
      // a chance to see isAuthenticated=false while still on the old route and
      // bounce to /login before we get a chance to navigate to "/" ourselves.
      navigate("/", { replace: true });
      await logout({ role: logoutRole, name: logoutName });
    } catch (error) {
      console.error("❌ Logout failed:", error);
    }
  };

  return (
    <div className={`dashboard-layout ${showNotifications ? "with-notifications" : ""}`}>
      {/* Sidebar */}
      <nav className="sidebar" aria-label="Sidebar Navigation">
        <div className="sidebar-user-info">
          <div className="sidebar-user-avatar" aria-hidden="true">
            {userInfo?.photoUrl || userInfo?.photo_url ? (
              <img src={userInfo.photoUrl || userInfo.photo_url} alt="" />
            ) : (
              (userInfo?.fullName || userInfo?.full_name || userInfo?.name || userInfo?.email || "?")
                .charAt(0)
                .toUpperCase()
            )}
          </div>
          <div className="sidebar-user-details">
            <span className="sidebar-user-name">
              {userInfo?.fullName || userInfo?.full_name || userInfo?.name || userInfo?.email || "User"}
            </span>
            {(userInfo?.roles || [role]).length > 1 ? (
              <select className="sidebar-role-switcher" value={role || ""} onChange={handleRoleSwitch} aria-label="Switch active role">
                {(userInfo?.roles || [role]).map((assignedRole) => <option key={assignedRole} value={assignedRole}>{assignedRole}</option>)}
              </select>
            ) : <span className="sidebar-user-role">{role}</span>}
          </div>
        </div>
        <h3 className="sidebar-title">Navigation</h3>
        <ul>
          {linksToRender.map(({ path, label, action }) => (
            <SecureNavLink key={path} action={action} to={path}>
              {label}
            </SecureNavLink>
          ))}

          {normalizedRole === "admin" && (
            <SecureNavLink action="manageSettings" to="/settings">
              ⚙️ Settings
            </SecureNavLink>
          )}

          <li>
            <button onClick={handleLogout} className="logout-btn" aria-label="Logout">
              🚪 Logout
            </button>
          </li>
        </ul>
      </nav>

      {/* Main Content */}
      <div className="dashboard-content">
        <header className="main-header" aria-label="Main Header">
          <h1>Barangay Information System</h1>
          <div className="header-actions">
            <button
              onClick={toggleDarkMode}
              className="dark-mode-toggle"
              aria-label="Toggle Dark Mode"
            >
              {isDarkMode ? "🌞 Light Mode" : "🌙 Dark Mode"}
            </button>
            <button
              type="button"
              className="messenger-button"
              onClick={() => navigate("/messages")}
              aria-label={unreadMessages ? `${unreadMessages} unread messages` : "Open messages"}
              title="Messages"
            >
              <span aria-hidden="true">💬</span>
              {unreadMessages > 0 && <span className="messenger-badge">{unreadMessages > 99 ? "99+" : unreadMessages}</span>}
            </button>
            <NotificationBell
              onClick={handleBellClick}
              count={unreadCount}
            />
          </div>
        </header>
        <Outlet context={{ user: userInfo }} />
      </div>

      {/* Notification Panel - third column that slides in */}
      <aside className="notification-panel">
        <header className="notification-header">
          <h2>Notifications</h2>
          <button
            type="button"
            className="notification-close-btn"
            onClick={() => setShowNotifications(false)}
            aria-label="Close notifications"
          >
            ✕
          </button>
        </header>
        <div className="notification-body">
          {notifications.length === 0 ? (
            <p>No notifications</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`notification-item ${n.read ? "read" : "unread"}`}
              >
                <span>{n.message}</span>
                <small>{formatPhilippineDateTime(n.timestamp)}</small>
                <div className="actions">
                  {!n.read && (
                    <button onClick={() => markAsRead(n.id)}>Mark read</button>
                  )}
                  <button onClick={() => deleteNotification(n.id)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
        <footer className="notification-footer">
          <button onClick={() => bulkDeleteNotifications(true)}>🗑 Clear Read</button>
          <button onClick={() => bulkDeleteNotifications(false)}>🗑 Delete All</button>
        </footer>
      </aside>
    </div>
  );
};

export default MainLayout;