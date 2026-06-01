import React, { useEffect, useState } from "react";
import { collection, getCountFromServer, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase";
import DashboardCard from "./DashboardCard";
import { useUser } from "../../context/UserContext";
import { COLLECTION_PERMISSIONS } from "../../config/roles"; 
import "../../styles/dashboard/registry-overview.css";

// 🔑 Static registry keys (avoid lint warning)
const REGISTRY_KEYS = ["residents", "businesses", "youth"];

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

const RegistryOverview = () => {
  const { can } = useUser(); 
  const [counts, setCounts] = useState({
    residents: "N/A",
    businesses: "N/A",
    youth: "N/A",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      const results = {};

      for (const key of REGISTRY_KEYS) {
        const permissions = COLLECTION_PERMISSIONS[key];
        const hasPermission =
          !permissions ||
          (Array.isArray(permissions)
            ? permissions.some((perm) => can(perm))
            : can(permissions));

        if (!hasPermission) {
          results[key] = "N/A";
          continue;
        }

        try {
          if (key === "youth") {
            results[key] = await getYouthResidentsCount();
          } else {
            const snap = await getCountFromServer(collection(db, key));
            results[key] = snap.data().count;
          }
        } catch (err) {
          console.warn(`⚠️ Cannot access ${key}:`, err.message);
          results[key] = "N/A";
        }
      }

      setCounts((prev) => ({ ...prev, ...results }));
      setLoading(false);
    };

    fetchCounts();
  }, [can]); 

  const registryData = [
    { label: "Resident Registry", value: counts.residents, variant: "accent", icon: "👥" },
    { label: "Business Registry", value: counts.businesses, variant: "success", icon: "💼" },
    { label: "Youth Registry", value: counts.youth, variant: "youth", icon: "🧑‍🎓" },
  ];

  return (
    <section className="registry-overview" aria-busy={loading} aria-live="polite">
      <h3>📋 Registry Overview</h3>
      <div className="registry-grid">
        {loading ? (
          <p>Loading registry data…</p>
        ) : (
          registryData.map(({ label, value, variant, icon }, index) => (
            <DashboardCard
              key={index}
              label={label}
              value={value}
              variant={variant}
              icon={icon}
            />
          ))
        )}
      </div>
    </section>
  );
};

export default RegistryOverview;
