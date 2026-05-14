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

const PERIOD_OPTIONS = ["day", "week", "month", "year"];

const parseTimestamp = (value) => {
  if (!value) return null;
  if (value?.toDate && typeof value.toDate === "function") {
    return value.toDate();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const loginEventWeight = (data = {}) => {
  const count = Number(data.count);
  return Number.isFinite(count) && count > 0 ? count : 1;
};

const parseAmount = (value) => {
  const num = Number(value);
  if (Number.isFinite(num)) return num;

  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const pad2 = (value) => String(value).padStart(2, "0");
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() + months, 1);
const addYears = (date, years) => new Date(date.getFullYear() + years, 0, 1);

const formatDateInput = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const formatMonthInput = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

const formatWeekInput = (date) => {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${pad2(weekNumber)}`;
};

const parseDateInput = (value) => {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const parseMonthInput = (value) => {
  if (!value) return null;
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return null;
  return new Date(year, month - 1, 1);
};

const parseWeekInput = (value) => {
  if (!value || !value.includes("-W")) return null;
  const [yearPart, weekPart] = value.split("-W");
  const year = Number(yearPart);
  const week = Number(weekPart);
  if (!year || !week) return null;

  const jan4 = new Date(year, 0, 4);
  const jan4DayIndex = (jan4.getDay() + 6) % 7;
  const week1Start = new Date(jan4);
  week1Start.setDate(jan4.getDate() - jan4DayIndex);

  const currentWeekStart = new Date(week1Start);
  currentWeekStart.setDate(week1Start.getDate() + (week - 1) * 7);
  return startOfDay(currentWeekStart);
};

const shiftDays = (date, days) => {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
};

const inRange = (date, start, endExclusive) => date >= start && date < endExclusive;

const getSinglePeriodRange = (period, picks, fallbackDate) => {
  const displayDate = fallbackDate || new Date();

  if (period === "day") {
    const start = startOfDay(parseDateInput(picks.day) || displayDate);
    const end = shiftDays(start, 1);
    return {
      start,
      end,
      label: start.toLocaleDateString(),
    };
  }

  if (period === "week") {
    const start = parseWeekInput(picks.week) || startOfDay(displayDate);
    const end = shiftDays(start, 7);
    return {
      start,
      end,
      label: `${start.toLocaleDateString()} - ${shiftDays(end, -1).toLocaleDateString()}`,
    };
  }

  if (period === "month") {
    const start = parseMonthInput(picks.month) || startOfMonth(displayDate);
    const end = addMonths(start, 1);
    return {
      start,
      end,
      label: start.toLocaleString("en-US", { month: "short", year: "numeric" }),
    };
  }

  const selectedYear = Number(picks.year) || displayDate.getFullYear();
  const start = new Date(selectedYear, 0, 1);
  const end = addYears(start, 1);
  return {
    start,
    end,
    label: `${selectedYear}`,
  };
};

const sumEntriesInRange = (entries, start, endExclusive) =>
  entries.reduce((total, item) => {
    if (!item?.date || !Number.isFinite(item.value)) return total;
    return inRange(item.date, start, endExclusive) ? total + item.value : total;
  }, 0);

const getLoginMetrics = async (today, now) => {
  try {
    const loginQuery = query(collection(db, "logins"));
    const snapshot = await getDocs(loginQuery);

    let total = 0;
    const entries = [];
    const weekStart = shiftDays(now, -7);
    const monthStart = addMonths(now, -1);
    let weekly = 0;
    let monthly = 0;

    snapshot.docs.forEach((item) => {
      const data = item.data() || {};
      const weight = loginEventWeight(data);
      const timestamp = parseTimestamp(data.timestamp);

      if (timestamp && timestamp >= today) {
        total += weight;
      }
      if (timestamp) {
        entries.push({ date: timestamp, value: weight });
        if (timestamp >= weekStart) weekly += weight;
        if (timestamp >= monthStart) monthly += weight;
      }
    });

    return { total, weekly, monthly, entries };
  } catch (err) {
    console.warn("⚠️ Error fetching logins metrics:", err.message);
    return {
      total: "N/A",
      weekly: "N/A",
      monthly: "N/A",
      entries: [],
    };
  }
};

const getCountMetrics = async (collectionName, dateFields, now) => {
  try {
    const snapshot = await getDocs(collection(db, collectionName));
    const total = snapshot.size;
    const entries = [];
    const weekStart = shiftDays(now, -7);
    const monthStart = addMonths(now, -1);
    let weekly = 0;
    let monthly = 0;

    snapshot.docs.forEach((item) => {
      const data = item.data() || {};
      const eventDate = dateFields
        .map((field) => parseTimestamp(data[field]))
        .find(Boolean);

      if (eventDate) {
        entries.push({ date: eventDate, value: 1 });
        if (eventDate >= weekStart) weekly += 1;
        if (eventDate >= monthStart) monthly += 1;
      }
    });

    return { total, weekly, monthly, entries };
  } catch (err) {
    console.warn(`⚠️ Cannot access ${collectionName}:`, err.message);
    return {
      total: "N/A",
      weekly: "N/A",
      monthly: "N/A",
      entries: [],
    };
  }
};

const getCollectionsMetrics = async (today, now) => {
  try {
    const paidPaymentsQuery = query(collection(db, "payments"), where("status", "==", "paid"));
    const snapshot = await getDocs(paidPaymentsQuery);

    let total = 0;
    const entries = [];
    const weekStart = shiftDays(now, -7);
    const monthStart = addMonths(now, -1);
    let weekly = 0;
    let monthly = 0;

    snapshot.docs.forEach((item) => {
      const data = item.data() || {};
      const amount = parseAmount(data.amount);
      const paidDate = parseTimestamp(data.datePaid || data.paymentDate || data.timestamp || data.createdAt);

      if (!paidDate) return;
      if (paidDate >= today) {
        total += amount;
      }

      entries.push({ date: paidDate, value: amount });
      if (paidDate >= weekStart) weekly += amount;
      if (paidDate >= monthStart) monthly += amount;
    });

    return { total, weekly, monthly, entries };
  } catch (err) {
    console.warn("⚠️ Cannot access payments for collections analytics:", err.message);
    return {
      total: "N/A",
      weekly: "N/A",
      monthly: "N/A",
      entries: [],
    };
  }
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount || 0);

const AnalyticsPanel = ({ role }) => {
  const nowAtLoad = new Date();
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMetricKey, setSelectedMetricKey] = useState("");
  const [hasAutoSelectedMetric, setHasAutoSelectedMetric] = useState(false);
  const [currentPeriodType, setCurrentPeriodType] = useState("month");
  const [comparePeriodType, setComparePeriodType] = useState("month");
  const [periodPicks, setPeriodPicks] = useState({
    current: {
      day: formatDateInput(nowAtLoad),
      week: formatWeekInput(nowAtLoad),
      month: formatMonthInput(nowAtLoad),
      year: String(nowAtLoad.getFullYear()),
    },
    compare: {
      day: formatDateInput(shiftDays(nowAtLoad, -1)),
      week: formatWeekInput(shiftDays(nowAtLoad, -7)),
      month: formatMonthInput(addMonths(nowAtLoad, -1)),
      year: String(nowAtLoad.getFullYear() - 1),
    },
  });
  const [error, setError] = useState(null);

  const normalizedRole = role?.trim().toLowerCase();
  const accessibleMetrics = useMemo(() => roleCollections[normalizedRole] || [], [normalizedRole]);

  useEffect(() => {
    setHasAutoSelectedMetric(false);
    setSelectedMetricKey("");
  }, [normalizedRole]);

  useEffect(() => {
    if (!normalizedRole) {
      setLoading(false);
      return;
    }

    const fetchMetrics = async () => {
      try {
        const now = new Date();
        const today = startOfToday();

        const results = await Promise.all(
          Object.keys(metricConfig).map(async (key) => {
            if (!accessibleMetrics.includes(key)) {
              return {
                key,
                ...metricConfig[key],
                value: "N/A",
                weekly: "N/A",
                monthly: "N/A",
                entries: [],
              };
            }

            if (key === "logins") {
              const loginMetrics = await getLoginMetrics(today, now);
              return {
                key,
                ...metricConfig[key],
                value: loginMetrics.total,
                weekly: loginMetrics.weekly,
                monthly: loginMetrics.monthly,
                entries: loginMetrics.entries,
              };
            }

            if (key === "collections") {
              const collectionMetrics = await getCollectionsMetrics(today, now);
              return {
                key,
                ...metricConfig[key],
                value:
                  typeof collectionMetrics.total === "number"
                    ? formatCurrency(collectionMetrics.total)
                    : collectionMetrics.total,
                weekly: collectionMetrics.weekly,
                monthly: collectionMetrics.monthly,
                entries: collectionMetrics.entries,
              };
            }

            if (key === "businesses") {
              const businessMetrics = await getCountMetrics(
                "businesses",
                ["submittedAt", "createdAt", "timestamp"],
                now
              );
              return {
                key,
                ...metricConfig[key],
                value: businessMetrics.total,
                weekly: businessMetrics.weekly,
                monthly: businessMetrics.monthly,
                entries: businessMetrics.entries,
              };
            }

            if (key === "complaints") {
              const complaintMetrics = await getCountMetrics(
                "complaints",
                ["createdAt", "timestamp", "submittedAt"],
                now
              );
              return {
                key,
                ...metricConfig[key],
                value: complaintMetrics.total,
                weekly: complaintMetrics.weekly,
                monthly: complaintMetrics.monthly,
                entries: complaintMetrics.entries,
              };
            }

            try {
              const snap = await getCountFromServer(collection(db, key));
              const total = snap.data().count;
              const metricCounts = await getCountMetrics(
                key,
                ["createdAt", "timestamp", "submittedAt"],
                now
              );
              const weekly = metricCounts.weekly;
              const monthly = metricCounts.monthly;
              return {
                key,
                ...metricConfig[key],
                value: total,
                weekly,
                monthly,
                entries: metricCounts.entries,
              };
            } catch (err) {
              console.warn(`⚠️ Error fetching ${key}:`, err.message);
              setError("Failed to load analytics data.");
              return {
                key,
                ...metricConfig[key],
                value: "N/A",
                weekly: "N/A",
                monthly: "N/A",
                entries: [],
              };
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

  useEffect(() => {
    if (!metrics.length) return;
    const hasSelected = metrics.some((metric) => metric.key === selectedMetricKey);
    if (!hasSelected && !selectedMetricKey && !hasAutoSelectedMetric) {
      const preferred = metrics.find((metric) => metric.key === "collections" && metric.value !== "N/A");
      const firstAvailable = preferred || metrics.find((metric) => metric.value !== "N/A") || metrics[0];
      setSelectedMetricKey(firstAvailable?.key || "");
      setHasAutoSelectedMetric(true);
      return;
    }

    if (!hasSelected && selectedMetricKey) {
      const preferred = metrics.find((metric) => metric.key === "collections" && metric.value !== "N/A");
      const firstAvailable = preferred || metrics.find((metric) => metric.value !== "N/A") || metrics[0];
      setSelectedMetricKey(firstAvailable?.key || "");
    }
  }, [metrics, selectedMetricKey, hasAutoSelectedMetric]);

  if (!normalizedRole) {
    return (
      <section className="analytics-panel">
        <h3>📊 Analytics Panel</h3>
        <p>Analytics not available for your role.</p>
      </section>
    );
  }

  const selectedMetric = metrics.find((metric) => metric.key === selectedMetricKey);
  const currentRange = getSinglePeriodRange(currentPeriodType, periodPicks.current, new Date());
  const compareRange = getSinglePeriodRange(comparePeriodType, periodPicks.compare, new Date());
  const selectedEntries = selectedMetric?.entries || [];
  const selectedComparison = {
    previous: sumEntriesInRange(selectedEntries, compareRange.start, compareRange.end),
    current: sumEntriesInRange(selectedEntries, currentRange.start, currentRange.end),
  };
  const periodLabels = { previous: compareRange.label, current: currentRange.label };
  const chartIsCurrency = selectedMetricKey === "collections";

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title: {
        display: true,
        text: selectedMetric
          ? `${selectedMetric.label}: ${periodLabels.previous} vs ${periodLabels.current}`
          : "Analytics Trends",
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = Number(context.raw || 0);
            if (chartIsCurrency) {
              return formatCurrency(value);
            }
            return `${value}`;
          },
        },
      },
    },
    scales: {
      x: { type: "category", title: { display: true, text: "Period" } },
      y: {
        beginAtZero: true,
        title: { display: true, text: chartIsCurrency ? "Amount" : "Count" },
      },
    },
  };

  const chartData = {
    labels: [periodLabels.previous, periodLabels.current],
    datasets: [
      {
        label: selectedMetric?.label || "Metric",
        data: [
          Number(selectedComparison.previous) || 0,
          Number(selectedComparison.current) || 0,
        ],
        backgroundColor: ["#94a3b8", "#3b82f6"],
      },
    ],
  };

  return (
    <section className="analytics-panel" aria-labelledby="analytics-title">
      <header className="analytics-header">
        <h3 id="analytics-title">📊 {normalizedRole} Analytics</h3>
      </header>

      <div className="metrics-grid" aria-busy={loading} aria-live="polite">
        {loading ? (
          <p>Loading analytics…</p>
        ) : error ? (
          <p className="error">{error}</p>
        ) : (
          <>
            {metrics.map(({ key, label, value, variant, icon }, index) => (
              <div
                key={index}
                className={`metric-card-wrap ${selectedMetricKey === key ? "selected" : ""}`}
                onClick={() => setSelectedMetricKey((prev) => (prev === key ? "" : key))}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedMetricKey((prev) => (prev === key ? "" : key));
                  }
                }}
              >
                <DashboardCard label={label} value={value} variant={variant} icon={icon} />
              </div>
            ))}
            {!!selectedMetric && (
              <div className="analytics-chart">
                <div className="chart-controls">
                  <label htmlFor="analytics-category-select">Category</label>
                  <select
                    id="analytics-category-select"
                    className="category-select"
                    value={selectedMetricKey}
                    onChange={(e) => setSelectedMetricKey(e.target.value)}
                  >
                    {metrics.map((metric) => (
                      <option key={metric.key} value={metric.key}>
                        {metric.label}
                      </option>
                    ))}
                  </select>

                  <div className="compare-controls">
                    <div className="compare-block">
                      <span className="compare-title">Current</span>
                      <div className="period-toggle" aria-label="Current Period Toggle">
                        {PERIOD_OPTIONS.map((period) => (
                          <button
                            key={`current-${period}`}
                            className={currentPeriodType === period ? "active" : ""}
                            type="button"
                            onClick={() => setCurrentPeriodType(period)}
                          >
                            {period.charAt(0).toUpperCase() + period.slice(1)}
                          </button>
                        ))}
                      </div>

                      {currentPeriodType === "day" && (
                        <input
                          type="date"
                          className="period-input"
                          value={periodPicks.current.day}
                          onChange={(e) =>
                            setPeriodPicks((prev) => ({
                              ...prev,
                              current: { ...prev.current, day: e.target.value },
                            }))
                          }
                        />
                      )}

                      {currentPeriodType === "week" && (
                        <input
                          type="week"
                          className="period-input"
                          value={periodPicks.current.week}
                          onChange={(e) =>
                            setPeriodPicks((prev) => ({
                              ...prev,
                              current: { ...prev.current, week: e.target.value },
                            }))
                          }
                        />
                      )}

                      {currentPeriodType === "month" && (
                        <input
                          type="month"
                          className="period-input"
                          value={periodPicks.current.month}
                          onChange={(e) =>
                            setPeriodPicks((prev) => ({
                              ...prev,
                              current: { ...prev.current, month: e.target.value },
                            }))
                          }
                        />
                      )}

                      {currentPeriodType === "year" && (
                        <input
                          type="number"
                          className="period-input"
                          min="2000"
                          max="2100"
                          value={periodPicks.current.year}
                          onChange={(e) =>
                            setPeriodPicks((prev) => ({
                              ...prev,
                              current: { ...prev.current, year: e.target.value },
                            }))
                          }
                        />
                      )}
                    </div>

                    <div className="compare-block">
                      <span className="compare-title">Compare</span>
                      <div className="period-toggle" aria-label="Compare Period Toggle">
                        {PERIOD_OPTIONS.map((period) => (
                          <button
                            key={`compare-${period}`}
                            className={comparePeriodType === period ? "active" : ""}
                            type="button"
                            onClick={() => setComparePeriodType(period)}
                          >
                            {period.charAt(0).toUpperCase() + period.slice(1)}
                          </button>
                        ))}
                      </div>

                      {comparePeriodType === "day" && (
                        <input
                          type="date"
                          className="period-input"
                          value={periodPicks.compare.day}
                          onChange={(e) =>
                            setPeriodPicks((prev) => ({
                              ...prev,
                              compare: { ...prev.compare, day: e.target.value },
                            }))
                          }
                        />
                      )}

                      {comparePeriodType === "week" && (
                        <input
                          type="week"
                          className="period-input"
                          value={periodPicks.compare.week}
                          onChange={(e) =>
                            setPeriodPicks((prev) => ({
                              ...prev,
                              compare: { ...prev.compare, week: e.target.value },
                            }))
                          }
                        />
                      )}

                      {comparePeriodType === "month" && (
                        <input
                          type="month"
                          className="period-input"
                          value={periodPicks.compare.month}
                          onChange={(e) =>
                            setPeriodPicks((prev) => ({
                              ...prev,
                              compare: { ...prev.compare, month: e.target.value },
                            }))
                          }
                        />
                      )}

                      {comparePeriodType === "year" && (
                        <input
                          type="number"
                          className="period-input"
                          min="2000"
                          max="2100"
                          value={periodPicks.compare.year}
                          onChange={(e) =>
                            setPeriodPicks((prev) => ({
                              ...prev,
                              compare: { ...prev.compare, year: e.target.value },
                            }))
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>
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
