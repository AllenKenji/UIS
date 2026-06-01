import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase";
import { useUser } from "../../context/UserContext";
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
      const { start, end } = buildPeriodWindow(periodType, selectedMonth, selectedYear);

      const results = await Promise.all(
        Object.entries(CATEGORIES).map(async ([key, label]) => {
          const permissions = COLLECTION_PERMISSIONS[key];

          // ✅ FIX: allow access if ANY permission matches
          const hasPermission =
            !permissions || permissions.some((perm) => can(perm));

          if (!hasPermission) {
            return { category: label, total: "N/A", periodLabel: label };
          }

          try {
            if (key === "youth") {
              const youthCount = await getYouthResidentsCount(start, end);
              return { category: label, total: youthCount, periodLabel: label };
            }

            if (key === "collections") {
              const snapshot = await getDocs(collection(db, "payments"));
              const total = snapshot.docs.reduce((count, docSnap) => {
                const data = docSnap.data() || {};
                const status = String(data.status || data.paymentStatus || "").trim().toLowerCase();
                const isPaid = status === "paid";
                return isPaid && isWithinRange(getRecordDate(key, data), start, end) ? count + 1 : count;
              }, 0);
              return { category: label, total, periodLabel: label };
            }

            const snapshot = await getDocs(collection(db, key));
            const total = snapshot.docs.reduce((count, docSnap) => {
              const data = docSnap.data() || {};
              return isWithinRange(getRecordDate(key, data), start, end) ? count + 1 : count;
            }, 0);
            return { category: label, total, periodLabel: label };
          } catch (err) {
            console.warn(`⚠️ Error fetching ${key}:`, err.message);
            return { category: label, total: "N/A", periodLabel: label };
          }
        })
      );

      if (!cancelled) {
        setStats(results);
        setLoading(false);
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
            const variant = CATEGORY_VARIANTS[entry.category] || "neutral";
            return (
              <li key={index} className={`audit-entry ${variant}`}>
                <strong>{entry.category}</strong>: {entry.total} entries<br />
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
