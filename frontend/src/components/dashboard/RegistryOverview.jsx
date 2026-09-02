import React, { useEffect, useState } from "react";
import DashboardCard from "./DashboardCard";
import { AuditAPI, DashboardAPI } from "../../services/api";
import "../../styles/dashboard/registry-overview.css";

const RegistryOverview = () => {
  const [counts, setCounts] = useState({
    residents: "N/A",
    businesses: "N/A",
    youth: "N/A",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [dashboardSummary, auditSummary] = await Promise.all([
          DashboardAPI.summary(),
          AuditAPI.summary(),
        ]);
        setCounts({
          residents: dashboardSummary?.residents ?? "N/A",
          businesses: dashboardSummary?.businesses ?? "N/A",
          youth: auditSummary?.youth ?? "N/A",
        });
      } catch (error) {
        console.warn("⚠️ Failed to load registry summary via API:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCounts();
  }, []); 

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
