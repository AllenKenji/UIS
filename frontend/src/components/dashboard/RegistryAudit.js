import { useEffect, useState } from "react";
import { getCountFromServer, collection } from "firebase/firestore";
import { db } from "../../services/firebase";
import { ResidentsAPI } from "../../services/api";
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

const getYouthResidentsCount = async () => {
  const data = await ResidentsAPI.list();
  const residents = Array.isArray(data) ? data : data?.items ?? [];
  return residents.filter((resident) => {
    const age = getResidentAge(resident);
    return typeof age === "number" && age >= YOUTH_MIN_AGE && age <= YOUTH_MAX_AGE;
  }).length;
};

const RegistryAudit = () => {
  const { can } = useUser(); 
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchRegistryStats = async () => {
      const now = new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

      const results = await Promise.all(
        Object.entries(CATEGORIES).map(async ([key, label]) => {
          const permissions = COLLECTION_PERMISSIONS[key];

          // ✅ FIX: allow access if ANY permission matches
          const hasPermission =
            !permissions || permissions.some((perm) => can(perm));

          if (!hasPermission) {
            return { category: label, total: "N/A", lastUpdated: now };
          }

          try {
            if (key === "youth") {
              const youthCount = await getYouthResidentsCount();
              return { category: label, total: youthCount, lastUpdated: now };
            }

            const snap = await getCountFromServer(collection(db, key));
            return { category: label, total: snap.data().count, lastUpdated: now };
          } catch (err) {
            console.warn(`⚠️ Error fetching ${key}:`, err.message);
            return { category: label, total: "N/A", lastUpdated: now };
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
  }, [can]);

  return (
    <section
      className="registry-audit"
      aria-labelledby="registry-audit-title"
      aria-busy={loading}
      aria-live="polite"
    >
      <h3 id="registry-audit-title">📋 Registry Audit</h3>
      {loading ? (
        <p>Loading registry stats…</p>
      ) : (
        <ul>
          {stats.map((entry, index) => {
            const variant = CATEGORY_VARIANTS[entry.category] || "neutral";
            return (
              <li key={index} className={`audit-entry ${variant}`}>
                <strong>{entry.category}</strong>: {entry.total} entries<br />
                <small>Last updated: {entry.lastUpdated}</small>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default RegistryAudit;
