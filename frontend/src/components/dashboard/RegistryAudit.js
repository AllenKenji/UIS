import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase";
import { useUser } from "../../context/UserContext";
import { usePayments } from "../../hooks/usePayments";
import { AuditAPI } from "../../services/api";
import { CATEGORIES, CATEGORY_VARIANTS, COLLECTION_PERMISSIONS } from "../../config/roles"; 
import "../../styles/dashboard/registry-audit.css";

const YOUTH_MIN_AGE = 15;
const YOUTH_MAX_AGE = 24;

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getResidentAge = (resident) => {
  if (typeof resident.age === "number") return resident.age;
  if (typeof resident.age === "string") {
    const parsed = Number.parseInt(resident.age, 10);
    if (Number.isFinite(parsed)) return parsed;
  }

  const birthDate = toDate(resident.birthDate || resident.dateOfBirth || resident.dob);
  if (!birthDate) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(Number(value) || 0);

const parseAmount = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

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

const isWithinRange = (value, start, end) => {
  const date = toDate(value);
  return Boolean(date && date >= start && date < end);
};

const getRecordDate = (key, record) => {
  if (key === "businesses") {
    return (
      record.submittedAt ||
      record.createdAt ||
      record.timestamp ||
      record.created_at ||
      record.updatedAt
    );
  }

  if (key === "collections") {
    return (
      record.datePaid ||
      record.paymentDate ||
      record.timestamp ||
      record.createdAt
    );
  }

  if (key === "logins") {
    return record.timestamp || record.createdAt;
  }

  return (
    record.createdAt ||
    record.timestamp ||
    record.created_at ||
    record.updatedAt ||
    record.date
  );
};

const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

const isPaidCollectionRecord = (record) => {
  const status = normalizeStatus(record.paymentStatus || record.status);
  return status === "paid" || status === "succeeded";
};

const resolveCollectionDate = (record) => {
  const candidates = [
    record.datePaid,
    record.paidAt,
    record.paymentDate,
    record.createdAt,
    record.date,
    record.updatedAt,
  ];

  for (const candidate of candidates) {
    const parsed = toDate(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
};

const getYouthResidentsCount = async (start, end) => {
  const snapshot = await getDocs(collection(db, "residents"));
  const residents = snapshot.docs.map((doc) => doc.data() || {});
  return residents.filter((resident) => {
    const age = getResidentAge(resident);
    const createdAt = resident.createdAt || resident.timestamp || resident.created_at;
    return (
      typeof age === "number" &&
      age >= YOUTH_MIN_AGE &&
      age <= YOUTH_MAX_AGE &&
      isWithinRange(createdAt, start, end)
    );
  }).length;
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
  const { transactions = [] } = usePayments();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periodType, setPeriodType] = useState("monthly");
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());

  useEffect(() => {
    let cancelled = false;

    const fetchRegistryStats = async () => {
      setLoading(true);
      const { start, end } = buildPeriodWindow(periodType, selectedMonth, selectedYear);

      const results = await Promise.all(
        Object.entries(CATEGORIES).map(async ([key, label]) => {
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

          try {
            if (key === "youth") {
              const youthCount = await getYouthResidentsCount(start, end);
              return { key, category: displayCategory, total: youthCount, periodLabel: label };
            }

            if (key === "collections") {
              const total = transactions.reduce((sum, record) => {
                const collectionDate = resolveCollectionDate(record);

                if (!isPaidCollectionRecord(record) || !collectionDate || collectionDate < start || collectionDate >= end) {
                  return sum;
                }
                return sum + parseAmount(record.amount);
              }, 0);

              if (total > 0) {
                return { key, category: displayCategory, total, periodLabel: label };
              }

              try {
                const summary = await AuditAPI.summary(
                  periodType === "yearly"
                    ? { periodType: "yearly", year: Number(selectedYear) || new Date().getFullYear() }
                    : { periodType: "monthly", month: selectedMonth }
                );
                return {
                  key,
                  category: displayCategory,
                  total: parseAmount(summary?.collectionsAmount),
                  periodLabel: label,
                  hadReadError: false,
                };
              } catch (summaryError) {
                console.warn("⚠️ Failed to load collections summary fallback:", summaryError);
              }

              return { key, category: displayCategory, total, periodLabel: label };
            }

            const snapshot = await getDocs(collection(db, key));
            const total = snapshot.docs.reduce((count, docSnap) => {
              const data = docSnap.data() || {};
              return isWithinRange(getRecordDate(key, data), start, end) ? count + 1 : count;
            }, 0);
            return { key, category: displayCategory, total, periodLabel: label };
          } catch (err) {
            console.warn(`⚠️ Error fetching ${key}:`, err.message);
            return { key, category: displayCategory, total: 0, periodLabel: label, hadReadError: true };
          }
        })
      );

      if (!cancelled) {
        let visibleResults = results.filter(Boolean);

        if (can("auditBarangayData")) {
          const keysNeedingSummary = visibleResults
            .filter((entry) => entry.hadReadError && SUMMARY_KEY_MAP[entry.key])
            .map((entry) => entry.key);

          if (keysNeedingSummary.length > 0) {
            try {
              const summary = await AuditAPI.summary();
              visibleResults = visibleResults.map((entry) => {
                if (!keysNeedingSummary.includes(entry.key)) return entry;
                const summaryKey = SUMMARY_KEY_MAP[entry.key];
                return {
                  ...entry,
                  total: summary?.[summaryKey] ?? entry.total,
                  hadReadError: false,
                };
              });
            } catch (error) {
              console.warn("⚠️ Failed to patch registry audit with summary data:", error);
            }
          }
        }

        if (visibleResults.length === 0 && can("auditBarangayData")) {
          try {
            const summary = await AuditAPI.summary();
            setStats(buildFallbackAuditEntries(summary));
          } catch (error) {
            console.warn("⚠️ Failed to load registry audit summary fallback:", error);
            setStats(buildFallbackAuditEntries());
          }
        } else {
          setStats(visibleResults.length > 0 ? visibleResults : buildFallbackAuditEntries());
        }

        setLoading(false);
      }
    };

    fetchRegistryStats();
    return () => {
      cancelled = true;
    };
  }, [can, periodType, selectedMonth, selectedYear, transactions]);

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
