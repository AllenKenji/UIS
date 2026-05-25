import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { useTheme } from "../context/ThemeContext";
import SecureNavLink from "./auth/SecureNavLink";
import NotificationBell from "../components/NotificationBell";
import { useNotifications } from "../context/NotificationContext";
import { NotificationsAPI } from "../services/api";
import { useEffect, useState } from "react";
import sidebarLinks from "../config/navigation";
import "./main-layout.css";

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

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { userInfo, role, logout } = useUser();
  const { isDarkMode, toggleDarkMode } = useTheme();
  const {
    notifications,
    unreadCount,
    markAsRead,
    deleteNotification,
    bulkDeleteNotifications,
  } = useNotifications();

  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    document.body.classList.add("dashboard-scroll-lock");
    return () => {
      document.body.classList.remove("dashboard-scroll-lock");
    };
  }, []);

  const normalizedRole = role?.trim().toLowerCase();
  const isSkModuleRoute = location.pathname.startsWith("/youth");
  const linksToRender = isSkModuleRoute && ["sk", "admin"].includes(normalizedRole)
    ? sidebarLinks.sk || []
    : sidebarLinks[normalizedRole] || sidebarLinks.default || [];

  const handleBellClick = () => {
    setShowNotifications((prev) => !prev);
  };

  const handleLogout = async () => {
    const officerRoles = ["admin", "staff", "secretary", "treasurer", "sk", "dilg", "surveyor", "supervisor"];
    const logoutRole = (normalizedRole || userInfo?.role || "officer").toString().trim().toLowerCase();
    const logoutName = getDisplayName(userInfo, userInfo?.email || "") || "Officer";

    try {
      // 🔔 Trigger logout notification (best-effort; should not block logout)
      try {
        if (officerRoles.includes(logoutRole)) {
          await NotificationsAPI.createOfficerLogOut(
            logoutName,
            logoutRole
          );
        } else if (logoutRole === "resident") {
          await NotificationsAPI.createResidentLogOut(1);
        }
      } catch (notificationError) {
        console.error("⚠️ Logout notification failed:", notificationError);
      }

      await logout();
      navigate("/login");
    } catch (error) {
      console.error("❌ Logout failed:", error);
    }
  };

  return (
    <div className={`dashboard-layout ${showNotifications ? "with-notifications" : ""}`}>
      {/* Sidebar */}
      <nav className="sidebar" aria-label="Sidebar Navigation">
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
                <small>{new Date(n.timestamp).toLocaleString()}</small>
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