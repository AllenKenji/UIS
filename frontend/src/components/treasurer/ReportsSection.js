import { useState } from "react";
import { useReports } from "../../hooks/useReports";

function ReportsSection() {
  const { generateMonthlyReport, generateYearlyReport } = useReports();
  const [reportType, setReportType] = useState("monthly");
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [lastExportLabel, setLastExportLabel] = useState("");

  const handleExport = () => {
    const report =
      reportType === "yearly"
        ? generateYearlyReport(selectedYear)
        : generateMonthlyReport(selectedMonth);

    if (report?.period) {
      setLastExportLabel(`${reportType === "yearly" ? "Year" : "Month"}: ${report.period}`);
    }
  };

  return (
    <div className="reports-section">
      <h2>Reports</h2>
      <div className="reports-controls">
        <label htmlFor="report-type">Type</label>
        <select
          id="report-type"
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
        >
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>

        {reportType === "yearly" ? (
          <>
            <label htmlFor="report-year">Year</label>
            <input
              id="report-year"
              type="number"
              min="2000"
              max="9999"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            />
          </>
        ) : (
          <>
            <label htmlFor="report-month">Month</label>
            <input
              id="report-month"
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </>
        )}

        <button onClick={handleExport}>
          {reportType === "yearly" ? "Export Selected Yearly Report" : "Export Selected Monthly Report"}
        </button>
      </div>
      {lastExportLabel ? <p>Last exported: {lastExportLabel}</p> : null}
    </div>
  );
}

export default ReportsSection;
