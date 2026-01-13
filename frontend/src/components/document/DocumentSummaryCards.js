import React, { useEffect, useState } from "react";
import { getCountFromServer, collection, query, where } from "firebase/firestore";
import { db } from "../../services/firebase";
import DashboardCard from "../dashboard/DashboardCard";
import "../../styles/dashboard/summary-card.css";

// 🔐 Centralized document categories
const DOCUMENT_CATEGORIES = [
  { type: "Certificate of Residency", label: "Residency", icon: "🏠", variant: "accent" },
  { type: "Barangay Clearance", label: "Clearance", icon: "✅", variant: "success" },
  { type: "Certificate of Indigency", label: "Indigency", icon: "🤝", variant: "info" },
  { type: "Certificate of Good Moral Character", label: "Good Moral", icon: "🌟", variant: "neutral" },
  { type: "Barangay Business Clearance", label: "Business Clearance", icon: "💼", variant: "warning" },
  { type: "Permit to Conduct Activities", label: "Activity Permit", icon: "🎉", variant: "accent" },
  { type: "Blotter Report", label: "Blotter Report", icon: "⚠️", variant: "danger" },
  { type: "Health Certificate", label: "Health Certificate", icon: "🩺", variant: "success" },
  { type: "Barangay ID", label: "Barangay ID", icon: "🪪", variant: "info" },
];

const DocumentSummaryCards = () => {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchStats = async () => {
      try {
        const results = await Promise.all(
          DOCUMENT_CATEGORIES.map(async (cat) => {
            try {
              // 🔎 Query documents filtered by type
              const q = query(collection(db, "documents"), where("type", "==", cat.type));
              const snap = await getCountFromServer(q);
              return { ...cat, value: snap.data().count };
            } catch (err) {
              console.warn(`⚠️ Error fetching ${cat.type}:`, err.message);
              return { ...cat, value: "N/A" };
            }
          })
        );

        if (!cancelled) {
          setStats(results);
          setLoading(false);
        }
      } catch (err) {
        console.error("❌ Error fetching document stats:", err.message);
        if (!cancelled) {
          setStats([]);
          setLoading(false);
        }
      }
    };

    fetchStats();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="summary-cards" aria-busy={loading} aria-live="polite">
      <h2>📊 Documents Issued per Category</h2>
      {loading ? (
        <p>Loading document stats...</p>
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

export default DocumentSummaryCards;
