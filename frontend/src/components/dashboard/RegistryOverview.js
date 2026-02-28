import React, { useEffect, useState } from "react";
import { collection, getCountFromServer } from "firebase/firestore";
import { db } from "../../services/firebase";
import DashboardCard from "./DashboardCard";
import { useUser } from "../../context/UserContext";
import { COLLECTION_PERMISSIONS } from "../../config/roles"; 
import "../../styles/dashboard/registry-overview.css";

// 🔑 Static registry keys (avoid lint warning)
const REGISTRY_KEYS = ["residents", "businesses", "youth"];

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
        const permission = COLLECTION_PERMISSIONS[key];
        if (!permission || !can(permission)) {
          results[key] = "N/A";
          continue;
        }

        try {
          const snap = await getCountFromServer(collection(db, key));
          results[key] = snap.data().count;
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
