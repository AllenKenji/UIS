import React, { useState } from "react";

function Settings() {
  const [preferences, setPreferences] = useState({
    theme: "light",
    language: "en",
    autoArchive: true,
    notifications: true,
  });

  const handleChange = e => {
    const { name, type, checked, value } = e.target;
    setPreferences(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  return (
    <div className="treasurer-main">
      <h1>Settings</h1>
      <p>Manage Treasurer account preferences here.</p>

      <section className="settings-section">
        <h2>System Preferences</h2>
        <label>
          Theme:
          <select name="theme" value={preferences.theme} onChange={handleChange}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label>
          Language:
          <select name="language" value={preferences.language} onChange={handleChange}>
            <option value="en">English</option>
            <option value="fil">Filipino</option>
          </select>
        </label>

        <label>
          <input
            type="checkbox"
            name="autoArchive"
            checked={preferences.autoArchive}
            onChange={handleChange}
          />
          Auto-archive monthly reports
        </label>

        <label>
          <input
            type="checkbox"
            name="notifications"
            checked={preferences.notifications}
            onChange={handleChange}
          />
          Enable email notifications
        </label>
      </section>
    </div>
  );
}

export default Settings;
