import { useEffect, useMemo, useState } from "react";
import { AuditAPI } from "../../services/api";
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

const PERIOD_OPTIONS = ["month", "year"];

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
  const [periodValues, setPeriodValues] = useState({ previous: null, current: null });

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
        const summary = await AuditAPI.summary();
        const results = Object.keys(metricConfig).map((key) => {
          const isAccessible = accessibleMetrics.includes(key);
          const value = isAccessible
            ? key === "collections"
              ? formatCurrency(summary?.collectionsAmount)
              : summary?.[key] ?? "N/A"
            : "N/A";

          return { key, ...metricConfig[key], value };
        });

        setMetrics(results);
      } catch (err) {
        console.warn("⚠️ Error fetching analytics summary:", err.message);
        setError("Failed to load analytics data.");
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

  useEffect(() => {
    if (!selectedMetricKey) return;

    let cancelled = false;
    const getSummaryParams = (periodType, picks) =>
      periodType === "year"
        ? { periodType: "yearly", year: Number(picks.year) || new Date().getFullYear() }
        : { periodType: "monthly", month: picks.month };

    const fetchPeriodValues = async () => {
      try {
        const [previousSummary, currentSummary] = await Promise.all([
          AuditAPI.summary(getSummaryParams(comparePeriodType, periodPicks.compare)),
          AuditAPI.summary(getSummaryParams(currentPeriodType, periodPicks.current)),
        ]);
        const getValue = (summary) =>
          selectedMetricKey === "collections"
            ? Number(summary?.collectionsAmount) || 0
            : Number(summary?.[selectedMetricKey]) || 0;

        if (!cancelled) {
          setPeriodValues({
            previous: getValue(previousSummary),
            current: getValue(currentSummary),
          });
        }
      } catch (err) {
        console.warn("⚠️ Error fetching analytics period summaries:", err.message);
        if (!cancelled) setPeriodValues({ previous: null, current: null });
      }
    };

    fetchPeriodValues();
    return () => {
      cancelled = true;
    };
  }, [selectedMetricKey, currentPeriodType, comparePeriodType, periodPicks]);

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
  const selectedComparison = periodValues;
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
          selectedComparison.previous,
          selectedComparison.current,
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
