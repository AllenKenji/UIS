import DashboardCard from "../dashboard/DashboardCard";
import "../../styles/dashboard/summary-card.css";

const DOCUMENT_CATEGORIES = [
  { type: "Resident Certificate", label: "Residency", icon: "🏠", variant: "accent" },
  { type: "Barangay Clearance", label: "Barangay Clearance", icon: "✅", variant: "success" },
  { type: "Indigency Certificate", label: "Indigency", icon: "🤝", variant: "info" },
  { type: "Good Moral Certificate", label: "Good Moral", icon: "🌟", variant: "neutral" },
  { type: "Business Clearance", label: "Business Clearance", icon: "💼", variant: "warning" },
  { type: "Activity Permit", label: "Activity Permit", icon: "🎉", variant: "accent" },
  { type: "Blotter Report", label: "Blotter Report", icon: "⚠️", variant: "danger" },
  { type: "Health Certificate", label: "Health Certificate", icon: "🩺", variant: "success" },
  { type: "Barangay ID", label: "Barangay ID", icon: "🪪", variant: "info" },
];

const DocumentSummaryCards = ({ documents = [], activeType = "all", onTypeClick }) => {
  const stats = DOCUMENT_CATEGORIES.map((cat) => ({
    ...cat,
    value: documents.filter((doc) => (doc.documentType || doc.document_type) === cat.type).length,
  }));

  const allCount = documents.length;

  return (
    <section className="summary-cards" aria-live="polite">
      <h2>📊 Documents by Category</h2>

      <DashboardCard
        label="All Documents"
        value={allCount}
        variant={activeType === "all" ? "accent" : "neutral"}
        icon="📁"
        selected={activeType === "all"}
        onClick={() => onTypeClick?.("all")}
      />

      {stats.map(({ type, label, value, variant, icon }) => (
        <DashboardCard
          key={type}
          label={label}
          value={value}
          variant={activeType === type ? "accent" : variant}
          icon={icon}
          selected={activeType === type}
          onClick={() => onTypeClick?.(type)}
        />
      ))}
    </section>
  );
};

export default DocumentSummaryCards;
