import React from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const DocumentTypeChart = () => {
  const data = {
    labels: ["Clearance", "Residency", "Indigency", "Business Permit"],
    datasets: [
      {
        label: "Requests",
        data: [40, 25, 15, 20], // sample data
        backgroundColor: "#3498db",
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      title: { display: true, text: "Document Types Requested" },
    },
  };

  return <Bar data={data} options={options} />;
};

export default DocumentTypeChart;
