import { useState } from "react";
import { useReports } from "../../hooks/useReports";

function ReportsSection() {
  const { generateMonthlyReport } = useReports();
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [lastExportLabel, setLastExportLabel] = useState("");

  const handleExport = () => {
    const report = generateMonthlyReport(selectedMonth);
    if (report?.month) {
      setLastExportLabel(report.month);
    }
  };

  return (
    <div className="reports-section">
      <h2>Reports</h2>
      <div className="reports-controls">
        <label htmlFor="report-month">Month</label>
        <input
          id="report-month"
          type="month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
        />
        <button onClick={handleExport}>Export Selected Monthly Report</button>
      </div>
      {lastExportLabel ? <p>Last exported: {lastExportLabel}</p> : null}
    </div>
  );
}

export default ReportsSection;
