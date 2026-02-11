import React from "react";
import { useReports } from "../../hooks/useReports";

function Reports() {
  const { generateMonthlyReport } = useReports();

  return (
    <div className="treasurer-main">
      <h1>Reports</h1>
      <button onClick={generateMonthlyReport}>Generate Monthly Report</button>
    </div>
  );
}

export default Reports;
