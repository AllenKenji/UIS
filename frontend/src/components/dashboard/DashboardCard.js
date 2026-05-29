import PropTypes from "prop-types";
import "../../styles/dashboard/dashboard-card.css";

const DashboardCard = ({
  label,
  value = "…",
  variant = "accent",
  icon = null,
  onClick,
  selected = false,
}) => {
  const cardId = `card-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const CardTag = onClick ? "button" : "div";

  return (
    <CardTag
      type={onClick ? "button" : undefined}
      className={`dashboard-card ${variant}${onClick ? " is-clickable" : ""}${selected ? " is-selected" : ""}`}
      aria-labelledby={cardId}
      aria-pressed={onClick ? selected : undefined}
      role={onClick ? undefined : "region"}
      onClick={onClick}
    >
      <h4 id={cardId}>
        {icon && <span className="card-icon" aria-hidden="true">{icon}</span>}{" "}
        {label}
      </h4>
      <p aria-live="polite">{value}</p>
    </CardTag>
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
  onClick: PropTypes.func,
  selected: PropTypes.bool,
};

export default DashboardCard;
