import { useEffect, useState } from "react";
import { getCountFromServer, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../services/firebase";
import DashboardCard from "./DashboardCard";
import { ALL_STATS, ROLE_COLLECTIONS } from "../../config/roles";
import { useUser } from "../../context/UserContext";
import { useNavigate } from "react-router-dom";
import "../../styles/dashboard/summary-card.css";

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
  const snapshot = await getDocs(collection(db, "residents"));
  const residents = snapshot.docs.map((doc) => doc.data() || {});
  return residents.filter((resident) => {
    const age = getResidentAge(resident);
    return typeof age === "number" && age >= YOUTH_MIN_AGE && age <= YOUTH_MAX_AGE;
  }).length;
};

const normalizeStatus = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

const countMatchingRecords = async (collectionName, predicate) => {
  const snapshot = await getDocs(collection(db, collectionName));
  return snapshot.docs.reduce((total, docSnap) => total + (predicate(docSnap.data() || {}) ? 1 : 0), 0);
};

const getSpecialDashboardCount = async (key) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  if (key === "residents") {
    return countMatchingRecords("residents", (resident) => {
      const createdAt = toDate(resident.createdAt || resident.timestamp || resident.created_at);
      return Boolean(createdAt && createdAt >= startOfToday && createdAt < startOfTomorrow);
    });
  }

  if (key === "businesses") {
    return countMatchingRecords("businesses", (business) => normalizeStatus(business.status) !== "approved");
  }

  if (key === "complaints") {
    return countMatchingRecords("complaints", (complaint) => normalizeStatus(complaint.status) !== "resolved");
  }

  if (key === "incidents") {
    return countMatchingRecords("incidents", (incident) => normalizeStatus(incident.status) === "pending");
  }

  return null;
};

const SummaryCards = () => {
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
    residents: "Residents Added Today",
    businesses: "Businesses Pending Evaluation",
    complaints: "Complaints Pending Review",
    incidents: "Incidents Pending",
  };

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
        if (isStaffOrAdmin && ["residents", "businesses", "complaints", "incidents"].includes(key)) {
          const value = await getSpecialDashboardCount(key);
          return { key, value };
        }

        if (key === "logins") {
          const value = await getLoginRecordsCount();
          return { key, value };
        }

        if (key === "collections") {
          const value = await getCollectionsAmount();
          return { key, value };
        }

        if (key === "youth") {
          const value = await getYouthResidentsCount();
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
              return { key, label: key, value, variant: "neutral", icon: "❓" };
            }
            return {
              key,
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
            label={isStaffOrAdmin && labelByKey[key] ? labelByKey[key] : label}
            value={value}
            variant={variant}
            icon={icon}
            onClick={routeByKey[key] ? () => navigate(routeByKey[key]) : undefined}
          />
        ))
      )}
    </section>
  );
};

export default SummaryCards;
