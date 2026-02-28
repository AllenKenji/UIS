import { useEffect, useState } from "react";
import { getCountFromServer, collection } from "firebase/firestore";
import { db } from "../../services/firebase";
import DashboardCard from "./DashboardCard";
import { ALL_STATS, ROLE_COLLECTIONS } from "../../config/roles";
import { useUser } from "../../context/UserContext";
import "../../styles/dashboard/summary-card.css";

const SummaryCards = () => {
  const { role } = useUser();
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const safeQuery = async (key) => {
      try {
        const snap = await getCountFromServer(collection(db, key));
        return { key, value: snap.data().count };
      } catch (err) {
        console.warn(`⚠️ ${role} cannot access ${key}:`, err.message);
        return { key, value: "N/A" };
      }
    };

    const start = async () => {
      // ✅ Only include collections allowed for this role
      const allowedKeys = ROLE_COLLECTIONS[role] || [];

      const results = await Promise.all(allowedKeys.map(safeQuery));

      if (!cancelled) {
        setStats(
          results.map(({ key, value }) => {
            const stat = ALL_STATS[key];
            if (!stat) {
              console.warn(`⚠️ Missing ALL_STATS entry for key: ${key}`);
              return { label: key, value, variant: "neutral", icon: "❓" };
            }
            return {
              label: stat.label,
              value,
              variant: value === "N/A" ? "neutral" : stat.variant,
              icon: stat.icon,
            };
          })
        );
        setLoading(false);
      }
    };

    start();
    return () => {
      cancelled = true;
    };
  }, [role]);

  return (
    <section className="summary-cards" aria-busy={loading} aria-live="polite">
      {loading ? (
        <p>Loading summary...</p>
      ) : stats.length === 0 ? (
        <p>No accessible data for this role.</p>
      ) : (
        stats.map(({ label, value, variant, icon }, index) => (
          <DashboardCard
            key={index}
            label={label}
            value={value}
            variant={variant}
            icon={icon}
          />
        ))
      )}
    </section>
  );
};

export default SummaryCards;
