// components/NotificationBell.js
import { useNotifications } from "../context/NotificationContext";
import { useState } from "react";
import "../styles/notification-bell.css";

const NotificationBell = () => {
  const {
    notifications,
    unreadCount,
    markAsRead,
    deleteNotification,
  } = useNotifications();
  const [open, setOpen] = useState(false);

  const toggleDropdown = () => {
    setOpen(!open);
  };

  return (
    <div className="notification-bell">
      <button className="bell-button" onClick={toggleDropdown}>
        🔔
        {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
      </button>

      {open && (
        <div className="dropdown">
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
      )}
    </div>
  );
};

export default NotificationBell;
