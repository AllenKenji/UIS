import { useEffect, useMemo, useState } from "react";
import { collection, getCountFromServer, query, where, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase";
import DashboardCard from "../dashboard/DashboardCard";
import { roleCollections, metricConfig } from "../../config/metrics";
import "../../styles/dashboard/analytics-panel.css";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// 🔧 Helper: count docs since a given date
const getCountSince = async (collectionName, dateField = "createdAt", sinceDate) => {
  try {
    const q = query(collection(db, collectionName), where(dateField, ">=", sinceDate));
    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (err) {
    console.warn(`⚠️ Cannot access ${collectionName}:`, err.message);
    return "N/A";
  }
};

const AnalyticsPanel = ({ role }) => {
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trendView, setTrendView] = useState(null);
  const [error, setError] = useState(null);

  const normalizedRole = role?.trim().toLowerCase();
  const accessibleMetrics = useMemo(() => roleCollections[normalizedRole] || [], [normalizedRole]);

  useEffect(() => {
    if (!normalizedRole) {
      setLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      try {
        const now = new Date();
        const lastWeek = new Date(now);
        lastWeek.setDate(now.getDate() - 7);
        const lastMonth = new Date(now);
        lastMonth.setMonth(now.getMonth() - 1);

        const results = await Promise.all(
          Object.keys(metricConfig).map(async (key) => {
            if (!accessibleMetrics.includes(key)) {
              return { ...metricConfig[key], value: "N/A", weekly: "N/A", monthly: "N/A" };
            }
            try {
              const snap = await getCountFromServer(collection(db, key));
              const total = snap.data().count;
              const weekly = await getCountSince(key, "createdAt", lastWeek);
              const monthly = await getCountSince(key, "createdAt", lastMonth);
              return { ...metricConfig[key], value: total, weekly, monthly };
            } catch (err) {
              console.warn(`⚠️ Error fetching ${key}:`, err.message);
              setError("Failed to load analytics data.");
              return { ...metricConfig[key], value: "N/A", weekly: "N/A", monthly: "N/A" };
            }
          })
        );

        setMetrics(results);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [normalizedRole, accessibleMetrics]);

  if (!normalizedRole) {
    return (
      <section className="analytics-panel">
        <h3>📊 Analytics Panel</h3>
        <p>Analytics not available for your role.</p>
      </section>
    );
  }

  // ✅ Define chartOptions in scope
  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title: { display: true, text: "Analytics Trends" },
    },
    scales: {
      x: { type: "category", title: { display: true, text: "Metrics" } },
      y: { beginAtZero: true, title: { display: true, text: "Count" } },
    },
  };

  const chartData = {
    labels: metrics.map((m) => m.label),
    datasets: [
      {
        label: trendView === "weekly" ? "Weekly Counts" : "Monthly Counts",
        data: metrics.map((m) => {
          const val = trendView === "weekly" ? m.weekly : m.monthly;
          return typeof val === "number" ? val : 0;
        }),
        backgroundColor: metrics.map((m) => m.color || "#3b82f6"),
      },
    ],
  };

  return (
    <section className="analytics-panel" aria-labelledby="analytics-title">
      <header className="analytics-header">
        <h3 id="analytics-title">📊 {normalizedRole} Analytics</h3>
        <div className="trend-toggle">
          <button
            className={trendView === "weekly" ? "active" : ""}
            onClick={() => setTrendView(trendView === "weekly" ? null : "weekly")}
          >
            Weekly
          </button>
          <button
            className={trendView === "monthly" ? "active" : ""}
            onClick={() => setTrendView(trendView === "monthly" ? null : "monthly")}
          >
            Monthly
          </button>
        </div>
      </header>

      <div className="metrics-grid" aria-busy={loading} aria-live="polite">
        {loading ? (
          <p>Loading analytics…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : (
          <>
            {metrics.map(({ label, value, variant, icon }, index) => (
              <DashboardCard key={index} label={label} value={value} variant={variant} icon={icon} />
            ))}
            {trendView && (
              <div className="analytics-chart">
                <Bar data={chartData} options={chartOptions} />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

export default AnalyticsPanel;
