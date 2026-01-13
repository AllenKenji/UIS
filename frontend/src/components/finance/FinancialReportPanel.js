import React from "react";
import "../../styles/admin.css";

const mockReports = [
  { month: "September", total: 15200 },
  { month: "October", total: 18450 },
];

const FinancialReportPanel = () => (
  <div className="financial-report">
    <h3>📈 Financial Reports</h3>
    <ul>
      {mockReports.map((r, index) => (
        <li key={index}>
          <strong>{r.month}</strong>: ₱{r.total.toLocaleString()}
        </li>
      ))}
    </ul>
  </div>
);

export default FinancialReportPanel;
