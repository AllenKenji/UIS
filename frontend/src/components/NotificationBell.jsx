// components/NotificationBell.js
import "../styles/notification-bell.css";

const NotificationBell = ({ onClick, count = 0 }) => {

  return (
    <div className="notification-bell">
      <button className="bell-button" onClick={onClick}>
        🔔
        {count > 0 && <span className="badge">{count}</span>}
      </button>
    </div>
  );
};

export default NotificationBell;
