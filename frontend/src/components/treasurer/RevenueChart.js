import React from "react";
import { usePayments } from "../../hooks/usePayments";
import { Bar } from "react-chartjs-2";

function RevenueChart() {
  const { revenueByCategory } = usePayments();

  const data = {
    labels: Object.keys(revenueByCategory),
    datasets: [
      {
        label: "Collections",
        data: Object.values(revenueByCategory),
        backgroundColor: "rgba(75,192,192,0.6)"
      }
    ]
  };

  return (
    <div className="revenue-chart" style={{ maxWidth: "600px", height: "300px" }}>
        <h2>Revenue Breakdown</h2>
        <Bar data={data} options={{ maintainAspectRatio: false }} />
    </div>
  );
}

export default RevenueChart;
