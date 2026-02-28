// components/layout/DashboardSection.js
const DashboardSection = ({
  title,
  icon,
  accent = "accent", 
  layout = "grid-auto", 
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
