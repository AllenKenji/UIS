import PropTypes from "prop-types";
import "../../styles/dashboard/dashboard-card.css";

const DashboardCard = ({
  label,
  value = "…",
  variant = "accent",
  icon = null,
}) => {
  const cardId = `card-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div
      className={`dashboard-card ${variant}`}
      aria-labelledby={cardId}
      role="region"
    >
      <h4 id={cardId}>
        {icon && <span className="card-icon" aria-hidden="true">{icon}</span>}{" "}
        {label}
      </h4>
      <p aria-live="polite">{value}</p>
    </div>
  );
};

DashboardCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  variant: PropTypes.oneOf([
    "accent",
    "success",
    "info",
    "danger",
    "warning",
    "dilg",
    "neutral",
    "youth",
  ]),
  icon: PropTypes.node,
};

export default DashboardCard;
