import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../services/firebase";
import DashboardCard from "../dashboard/DashboardCard";
import "../../styles/dashboard/summary-card.css";

const DOCUMENT_CATEGORIES = [
  { type: "Resident Certificate", label: "Residency", icon: "🏠", variant: "accent" },
  { type: "Barangay Clearance", label: "Barangay Clearance", icon: "✅", variant: "success" },
  { type: "Indigency Certificate", label: "Indigency", icon: "🤝", variant: "info" },
  { type: "Good Moral Certificate", label: "Good Moral", icon: "🌟", variant: "neutral" },
  { type: "Business Clearance", label: "Business Clearance", icon: "💼", variant: "warning" },
  { type: "Activity Permit", label: "Activity Permit", icon: "🎉", variant: "accent" },
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
              const counterRef = doc(db, "counters", cat.type);
              const snap = await getDoc(counterRef);

              // 🪄 Seed script logic: create doc if missing
              if (!snap.exists()) {
                await setDoc(counterRef, { last_number: 0 });
                return { ...cat, value: 0 };
              }

              const value = snap.data().last_number || 0;
              return { ...cat, value };
            } catch (err) {
              console.warn(`⚠️ Error fetching counter for ${cat.type}:`, err.message);
              return { ...cat, value: "N/A" };
            }
          })
        );

        if (!cancelled) {
          setStats(results);
          setLoading(false);
        }
      } catch (err) {
        console.error("❌ Error fetching counters:", err.message);
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
