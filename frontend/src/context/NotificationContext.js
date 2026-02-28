// context/NotificationContext.js
import { createContext, useContext, useEffect, useState, useRef } from "react";
import { NotificationsAPI } from "../services/api";
import { getAuth } from "firebase/auth";

const NotificationContext = createContext();
export const useNotifications = () => useContext(NotificationContext);

// 🔑 Token utilities
async function refreshToken() {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(true); // force refresh
}

function decodeToken(jwt) {
  try {
    return JSON.parse(atob(jwt.split(".")[1]));
  } catch {
    return null;
  }
}

export const NotificationProvider = ({ children, token }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const retryCountRef = useRef(0);

  const filterUnread = (list) => list.filter((n) => !n.read).slice(0, 20);

  // 📜 Load initial history
  useEffect(() => {
    if (!token) return;

    const loadHistory = async () => {
      try {
        const history = await NotificationsAPI.list();
        const unread = filterUnread(history);
        setNotifications(unread);
        setUnreadCount(unread.length);
      } catch (err) {
        console.error("⚠️ Failed to load notifications", err);
      }
    };

    loadHistory();
  }, [token]);

  // 🔌 WebSocket connection + reconnection
  useEffect(() => {
    if (!token) return;

    const connect = async (authToken = token) => {
      const payload = decodeToken(authToken);

      // Refresh if expired
      if (!payload || Date.now() / 1000 > payload.exp) {
        console.warn("🔄 Token expired, attempting refresh...");
        const newToken = await refreshToken();
        if (!newToken) {
          console.error("❌ Failed to refresh token, not reconnecting");
          return;
        }
        return connect(newToken);
      }

      const ws = new WebSocket(
        `${process.env.REACT_APP_WS_BASE_URL}/ws/notifications?token=${authToken}`
      );

      wsRef.current = ws;

      ws.onopen = () => {
        console.log("✅ WebSocket connected");
        retryCountRef.current = 0;
      };

      ws.onmessage = (event) => {
        console.log("📩 Notification received:", event.data);
        // TODO: optionally update state with new notification
      };

      ws.onerror = (err) => {
        console.error("⚠️ WebSocket error", err);
      };

      ws.onclose = async (event) => {
        console.log("❌ WebSocket disconnected", event.code, event.reason);

        if (event.code === 4001) {
          console.error("Forbidden — trying token refresh before reconnect");
          const newToken = await refreshToken();
          if (newToken) connect(newToken);
          return;
        }

        if (!navigator.onLine) {
          console.error("Offline — not retrying until back online");
          return;
        }

        if (retryCountRef.current < 5) {
          retryCountRef.current++;
          const delay = Math.min(5000 * retryCountRef.current, 30000);
          reconnectTimerRef.current = setTimeout(() => connect(authToken), delay);
        } else {
          console.error("Max retries reached — giving up");
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close();
    };
  }, [token]);

  // 🔧 Notification actions
  const updateState = (updater) => {
    setNotifications((prev) => {
      const updated = updater(prev);
      setUnreadCount(updated.length);
      return updated;
    });
  };

  const resetUnread = () => setUnreadCount(0);

  const markAsRead = async (id) => {
    updateState((prev) => prev.filter((n) => n.id !== id));
    try {
      await NotificationsAPI.markAsRead(id);
    } catch (err) {
      console.error("⚠️ Failed to mark notification as read", err);
    }
  };

  const deleteNotification = async (id) => {
    updateState((prev) => prev.filter((n) => n.id !== id));
    try {
      await NotificationsAPI.delete(id);
    } catch (err) {
      console.error("⚠️ Failed to delete notification", err);
    }
  };

  const bulkDeleteNotifications = async () => {
    setNotifications([]);
    setUnreadCount(0);
    try {
      await NotificationsAPI.bulkDelete(false);
    } catch (err) {
      console.error("⚠️ Failed to bulk delete notifications", err);
    }
  };

  const refreshNotifications = async () => {
    try {
      const history = await NotificationsAPI.list();
      const unread = filterUnread(history);
      setNotifications(unread);
      setUnreadCount(unread.length);
    } catch (err) {
      console.error("⚠️ Failed to refresh notifications", err);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        resetUnread,
        markAsRead,
        deleteNotification,
        bulkDeleteNotifications,
        refreshNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
