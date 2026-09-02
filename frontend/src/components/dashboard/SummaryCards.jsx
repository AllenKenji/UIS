import { useEffect, useState } from "react";
import DashboardCard from "./DashboardCard";
import { ALL_STATS, ROLE_COLLECTIONS } from "../../config/roles";
import { useUser } from "../../context/UserContext";
import { useNavigate } from "react-router-dom";
import { AuditAPI, DashboardAPI } from "../../services/api";
import "../../styles/dashboard/summary-card.css";

const SummaryCards = ({ onCardClick } = {}) => {
  const { role } = useUser();
  const navigate = useNavigate();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  const isStaffOrAdmin = role === "staff" || role === "admin";
  const routeByKey = {
    residents: "/residents",
    businesses: "/businesses",
    complaints: "/allComplaints",
    incidents: "/incidents",
    documents: "/documents",
  };

  const labelByKey = {
    residents: "Resident Records",
    businesses: "Business Records",
    complaints: "Complaint Records",
    incidents: "Incident Records",
    documents: "Document Requests",
    youth: "Youth Registry",
    logins: "Login Events",
    collections: "Collections Recorded",
  };

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      const allowedKeys = ROLE_COLLECTIONS[role] || [];
      try {
        const [auditSummary, dashboardSummary] = await Promise.all([
          AuditAPI.summary(),
          DashboardAPI.summary(),
        ]);
        const results = allowedKeys.map((key) => ({
          key,
          value: key === "collections"
            ? new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(auditSummary?.collectionsAmount) || 0)
            : dashboardSummary?.[key] ?? auditSummary?.[key] ?? "N/A",
        }));

        if (!cancelled) {
          setStats(results.map(({ key, value }) => {
            const stat = ALL_STATS[key];
            return { key, label: stat?.label || key, value, variant: value === "N/A" ? "neutral" : stat?.variant, icon: stat?.icon || "❓" };
          }));
        }
      } catch (err) {
        console.warn(`⚠️ ${role} cannot access dashboard summaries:`, err.message);
        if (!cancelled) setStats(allowedKeys.map((key) => ({ key, ...ALL_STATS[key], value: "N/A", variant: "neutral" })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    start();
    return () => {
      cancelled = true;
    };
  }, [isStaffOrAdmin, role]);

  return (
    <section className="summary-cards" aria-busy={loading} aria-live="polite">
      {loading ? (
        <p>Loading summary...</p>
      ) : stats.length === 0 ? (
        <p>No accessible data for this role.</p>
      ) : (
        stats.map(({ key, label, value, variant, icon }, index) => (
          <DashboardCard
            key={key || index}
            label={labelByKey[key] || label}
            value={value}
            variant={variant}
            icon={icon}
            onClick={
              onCardClick
                ? () => onCardClick(key)
                : routeByKey[key]
                  ? () => navigate(routeByKey[key])
                  : undefined
            }
          />
        ))
      )}
    </section>
  );
};

export default SummaryCards;
