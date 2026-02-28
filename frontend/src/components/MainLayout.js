import { Outlet, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { useTheme } from "../context/ThemeContext";
import SecureNavLink from "./auth/SecureNavLink";
import NotificationBell from "../components/NotificationBell";
import { useNotifications } from "../context/NotificationContext";
import { NotificationsAPI } from "../services/api";
import { useState } from "react";
import sidebarLinks from "../config/navigation";
import "./main-layout.css";

const MainLayout = () => {
  const navigate = useNavigate();
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

  const linksToRender = sidebarLinks[role] || sidebarLinks.default || [];

  const handleLogout = async () => {
    try {
      // 🔔 Trigger logout notification
      if (role === "staff" || role === "admin") {
        await NotificationsAPI.createOfficerLogOut(userInfo.fullName || userInfo.email);
      } else if (role === "resident") {
        await NotificationsAPI.createResidentLogOut(1);
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

          {role === "admin" && (
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
              onClick={() => setShowNotifications((prev) => !prev)}
              count={unreadCount}
            />
          </div>
        </header>
        <Outlet context={{ user: userInfo }} />
      </div>

      {/* Notification Panel - MOVED OUTSIDE dashboard-content */}
      {showNotifications && (
        <aside className="notification-panel">
          <header className="notification-header">
            <h2>Notifications</h2>
            <button className="close-btn" onClick={() => setShowNotifications((prev) => !prev)}>
              ✖ Close
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
            <button onClick={() => bulkDeleteNotifications(false)}>🗑 Clear All</button>
          </footer>
        </aside>
      )}
    </div>
  );
};

export default MainLayout;