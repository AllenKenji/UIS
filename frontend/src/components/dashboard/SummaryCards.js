import { useEffect, useState } from "react";
import { getCountFromServer, collection, getDocs, query, where } from "firebase/firestore";
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

    const parseTimestamp = (value) => {
      if (!value) return null;
      if (value?.toDate && typeof value.toDate === "function") {
        return value.toDate();
      }
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    };

    const startOfToday = () => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    };

    const getLoginRecordsCount = async () => {
      const loginQuery = query(collection(db, "logins"), where("timestamp", ">=", startOfToday()));
      const snapshot = await getDocs(loginQuery);
      return snapshot.docs.reduce((total, item) => {
        const data = item.data() || {};
        const count = Number(data.count);
        const timestamp = parseTimestamp(data.timestamp);
        if (!timestamp) {
          return total;
        }
        return total + (Number.isFinite(count) && count > 0 ? count : 1);
      }, 0);
    };

    const parseAmount = (value) => {
      const num = Number(value);
      if (Number.isFinite(num)) return num;

      const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const getCollectionsAmount = async () => {
      const paidPaymentsQuery = query(collection(db, "payments"), where("status", "==", "paid"));
      const snapshot = await getDocs(paidPaymentsQuery);
      const today = startOfToday();

      const totalAmount = snapshot.docs.reduce((sum, item) => {
        const data = item.data() || {};
        const paidDate = parseTimestamp(data.datePaid || data.paymentDate || data.timestamp || data.createdAt);
        if (!paidDate || paidDate < today) {
          return sum;
        }
        const amount = parseAmount(data.amount);
        return sum + amount;
      }, 0);

      return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
      }).format(totalAmount);
    };

    const safeQuery = async (key) => {
      try {
        if (key === "logins") {
          const value = await getLoginRecordsCount();
          return { key, value };
        }

        if (key === "collections") {
          const value = await getCollectionsAmount();
          return { key, value };
        }

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
