// components/layout/DashboardSection.js
import React from "react";

const DashboardSection = ({
  title,
  icon,
  accent = "accent", // "accent", "success", "danger"
  layout = "grid-auto", // "grid-auto", "grid-2", "flex-wrap"
  ariaLabel,
  children,
}) => {
  const sectionClass = `dashboard-section ${layout} ${accent}-section`;

  return (
    <section className={sectionClass} aria-label={ariaLabel}>
        <h3>{icon} {title}</h3>
        {children}
    </section>
  );
};

export default DashboardSection;
