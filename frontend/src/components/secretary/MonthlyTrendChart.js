import React, { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const MonthlyTrendChart = ({ documents = [] }) => {
  // Aggregate counts by month
  const { labels, counts } = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const map = Array(12).fill(0);

    documents.forEach((doc) => {
      const createdAt = doc.created_at || doc.createdAt;
      if (!createdAt) return;

      const date = new Date(createdAt);
      const monthIndex = date.getMonth(); // 0 = Jan, 11 = Dec
      map[monthIndex] += 1;
    });

    return { labels: months, counts: map };
  }, [documents]);

  const data = {
    labels,
    datasets: [
      {
        label: "Requests",
        data: counts,
        borderColor: "#9b59b6",
        backgroundColor: "rgba(155, 89, 182, 0.2)",
        tension: 0.3,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title: { display: true, text: "Monthly Request Trends" },
    },
  };

  return <Line data={data} options={options} />;
};

export default MonthlyTrendChart;
