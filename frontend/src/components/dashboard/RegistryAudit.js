import React, { useEffect, useState } from "react";
import { getCountFromServer, collection } from "firebase/firestore";
import { db } from "../../services/firebase";
import { useUser } from "../../context/UserContext";
import { CATEGORIES, CATEGORY_VARIANTS, COLLECTION_PERMISSIONS } from "../../config/roles"; 
import "../../styles/dashboard/registry-audit.css";

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
