import { useEffect, useState } from "react";
import { useUser } from "../../context/UserContext";
import { AuditAPI } from "../../services/api";
import { CATEGORIES, CATEGORY_VARIANTS, COLLECTION_PERMISSIONS } from "../../config/roles"; 
import "../../styles/dashboard/registry-audit.css";

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value) || 0);

const buildPeriodWindow = (periodType, selectedMonth, selectedYear) => {
  if (periodType === "yearly") {
    const year = Number(selectedYear) || new Date().getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    return {
      start,
      end,
      label: `${year}`,
    };
  }

  const [yearPart, monthPart] = String(selectedMonth || new Date().toISOString().slice(0, 7)).split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 1);
  return {
    start,
    end,
    label: start.toLocaleString("en-US", { month: "long", year: "numeric" }),
  };
};

const buildFallbackAuditEntries = (summary = {}) => [
  { key: "residents", category: "Residents", total: summary?.residents ?? 0, periodLabel: "Residents" },
  { key: "businesses", category: "Businesses", total: summary?.businesses ?? 0, periodLabel: "Businesses" },
  { key: "complaints", category: "Complaints", total: summary?.complaints ?? 0, periodLabel: "Complaints" },
  { key: "incidents", category: "Incidents", total: summary?.incidents ?? 0, periodLabel: "Incidents" },
  { key: "documents", category: "Documents", total: summary?.documents ?? 0, periodLabel: "Documents" },
  { key: "logins", category: "Login", total: summary?.logins ?? 0, periodLabel: "Login / Day" },
  { key: "youth", category: "Youth Registry", total: summary?.youth ?? 0, periodLabel: "Youth Registry" },
  { key: "collections", category: "Collections", total: summary?.collectionsAmount ?? 0, periodLabel: "Collections / Day" },
];

const SUMMARY_KEY_MAP = {
  residents: "residents",
  businesses: "businesses",
  complaints: "complaints",
  incidents: "incidents",
  documents: "documents",
  logins: "logins",
  youth: "youth",
  collections: "collectionsAmount",
};

const RegistryAudit = () => {
  const { can } = useUser(); 
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periodType, setPeriodType] = useState("monthly");
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  useEffect(() => {
    let cancelled = false;

    const fetchRegistryStats = async () => {
      setLoading(true);
      const summaryParams =
        periodType === "yearly"
          ? { periodType: "yearly", year: Number(selectedYear) || new Date().getFullYear() }
          : { periodType: "monthly", month: selectedMonth };

      try {
        const summary = await AuditAPI.summary(summaryParams);
        const results = Object.entries(CATEGORIES).map(([key, label]) => {
          const displayCategory =
            key === "logins"
              ? "Login"
              : key === "collections"
                ? "Collections"
                : label;

          const permissions = COLLECTION_PERMISSIONS[key];

          // ✅ FIX: allow access if ANY permission matches
          const hasPermission =
            !permissions || permissions.some((perm) => can(perm));

          if (!hasPermission) {
            return null;
          }

          const summaryKey = SUMMARY_KEY_MAP[key];
          return {
            key,
            category: displayCategory,
            total: summaryKey ? summary?.[summaryKey] ?? "N/A" : "N/A",
            periodLabel: label,
          };
        }).filter(Boolean);

        if (!cancelled) {
          setStats(results.length > 0 ? results : buildFallbackAuditEntries(summary));
        }
      } catch (error) {
        console.warn("⚠️ Failed to load registry audit summary:", error);
        if (!cancelled) setStats(buildFallbackAuditEntries());
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRegistryStats();
    return () => {
      cancelled = true;
    };
  }, [can, periodType, selectedMonth, selectedYear]);

  const activePeriodLabel = buildPeriodWindow(periodType, selectedMonth, selectedYear).label;

  return (
    <section
      className="registry-audit"
      aria-labelledby="registry-audit-title"
      aria-busy={loading}
      aria-live="polite"
    >
      <h3 id="registry-audit-title">📋 Registry Audit</h3>
      <div className="registry-audit-controls">
        <label htmlFor="registry-audit-period">View</label>
        <select
          id="registry-audit-period"
          value={periodType}
          onChange={(e) => setPeriodType(e.target.value)}
        >
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>

        {periodType === "yearly" ? (
          <input
            type="number"
            min="2000"
            max="9999"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            aria-label="Select audit year"
          />
        ) : (
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            aria-label="Select audit month"
          />
        )}
      </div>
      <p className="registry-audit-period-label">Showing registry audit for {activePeriodLabel}.</p>
      {loading ? (
        <p>Loading registry stats…</p>
      ) : (
        <ul>
          {stats.map((entry, index) => {
            const baseCategoryLabel = CATEGORIES[entry.key] || entry.category;
            const variant = CATEGORY_VARIANTS[baseCategoryLabel] || "neutral";
            const totalValue =
              entry.key === "collections" && entry.total !== "N/A"
                ? formatCurrency(entry.total)
                : entry.total;
            return (
              <li key={index} className={`audit-entry ${variant}`}>
                <strong>{entry.category}</strong>: {totalValue}{entry.key === "collections" ? "" : " entries"}<br />
                <small>Period: {activePeriodLabel}</small>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default RegistryAudit;
