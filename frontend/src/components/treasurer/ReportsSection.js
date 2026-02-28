import { useReports } from "../../hooks/useReports";

function ReportsSection() {
  const { generateMonthlyReport } = useReports();

  return (
    <div className="reports-section">
      <h2>Reports</h2>
      <button onClick={generateMonthlyReport}>Export Monthly Report</button>
    </div>
  );
}

export default ReportsSection;
