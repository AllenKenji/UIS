import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { useTheme } from "../context/ThemeContext";
import SecureNavLink from "./auth/SecureNavLink";
import sidebarLinks from "../config/navigation"; // 👈 moved out
import "./main-layout.css";

const MainLayout = () => {
  const navigate = useNavigate();
  const { userInfo, role, logout } = useUser();
  const { isDarkMode, toggleDarkMode } = useTheme();

  const linksToRender = sidebarLinks[role] || sidebarLinks.default || [];

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("❌ Logout failed:", error);
    }
  };

  const renderLinks = (links) =>
    links.map(({ path, label, action }) => (
      <SecureNavLink key={path} action={action} to={path}>
        {label}
      </SecureNavLink>
    ));

  return (
    <div className="dashboard-layout">
      <nav className="sidebar" aria-label="Sidebar Navigation">
        <h3 className="sidebar-title">Navigation</h3>
        <ul>
          {renderLinks(linksToRender)}

          {role === "admin" && (
            <SecureNavLink action="manageSettings" to="/settings">
              ⚙️ Settings
            </SecureNavLink>
          )}

          <li>
            <button
              onClick={handleLogout}
              className="logout-btn"
              aria-label="Logout"
            >
              🚪 Logout
            </button>
          </li>
        </ul>
      </nav>

      <div className="dashboard-content">
        <header className="main-header" aria-label="Main Header">
          <h1>Barangay Information System</h1>
          <button
            onClick={toggleDarkMode}
            className="dark-mode-toggle"
            aria-label="Toggle Dark Mode"
          >
            {isDarkMode ? "🌞 Light Mode" : "🌙 Dark Mode"}
          </button>
        </header>

        <Outlet context={{ user: userInfo }} />
      </div>
    </div>
  );
};

export default MainLayout;
