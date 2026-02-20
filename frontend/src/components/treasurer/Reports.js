import React, { useState } from "react";
import { useReports } from "../../hooks/useReports";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend
} from "chart.js";

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Title, Tooltip, Legend);

function Reports() {
  const { generateMonthlyReport } = useReports();
  const [currentReport, setCurrentReport] = useState(null);
  const [archive, setArchive] = useState([]);

  const handleGenerate = () => {
    const result = generateMonthlyReport();
    setCurrentReport(result);

    setArchive(prev => [
      ...prev,
      {
        ...result,
        month: new Date().toLocaleString("default", { month: "long", year: "numeric" })
      }
    ]);
  };

  // Clear selected report by index
  const handleClearSelected = (index) => {
    setArchive(prev => prev.filter((_, i) => i !== index));
  };

  // Chart data
  const chartData = {
    labels: archive.map(r => r.month),
    datasets: [
      {
        label: "Collections",
        data: archive.map(r => r.collections || 0),
        borderColor: "#2d8fdd",
        backgroundColor: "rgba(45,143,221,0.2)",
        tension: 0.3
      },
      {
        label: "Disbursements",
        data: archive.map(r =>
          r.disbursements?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0
        ),
        borderColor: "#dd2d2d",
        backgroundColor: "rgba(221,45,45,0.2)",
        tension: 0.3
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title: { display: true, text: "Collections vs Disbursements Over Time" }
    }
  };

  return (
    <div className="treasurer-main">
      <header className="header">
        <h1>Reports</h1>
        <button className="generate-btn" onClick={handleGenerate}>
          Generate Monthly Report (PDF)
        </button>
      </header>

      {/* Current Report */}
      {currentReport ? (
        <section className="summary">
          <h2>Current Report Summary</h2>
          <ul>
            <li><strong>Total Collections:</strong> ₱{currentReport.collections?.toLocaleString() || 0}</li>
            <li><strong>Total Disbursements:</strong> ₱{currentReport.disbursements?.reduce((sum, d) => sum + (d.amount || 0), 0).toLocaleString()}</li>
            <li><strong>Net Balance:</strong> ₱{(currentReport.collections - currentReport.disbursements?.reduce((sum, d) => sum + (d.amount || 0), 0)).toLocaleString()}</li>
          </ul>
        </section>
      ) : (
        <section className="report-output">
          <h2>Report Output</h2>
          <p>No report generated yet.</p>
        </section>
      )}

      {/* Archive Table */}
      {archive.length > 0 && (
        <section className="archive">
          <h2>Previous Reports</h2>
          <table className="archive-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Total Collections</th>
                <th>Total Disbursements</th>
                <th>Net Balance</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {archive.map((r, idx) => {
                const totalDisb = r.disbursements?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0;
                const netBalance = (r.collections || 0) - totalDisb;
                return (
                  <tr key={idx}>
                    <td>{r.month}</td>
                    <td>₱{r.collections?.toLocaleString() || 0}</td>
                    <td>₱{totalDisb.toLocaleString()}</td>
                    <td>₱{netBalance.toLocaleString()}</td>
                    <td>
                      <button className="clear-btn" onClick={() => handleClearSelected(idx)}>
                        Clear
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Chart Visualization */}
      {archive.length > 0 && (
        <section className="chart">
          <Line data={chartData} options={chartOptions} />
        </section>
      )}
    </div>
  );
}

export default Reports;
