import React from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

const PaymentStatusChart = () => {
  const data = {
    labels: ["Paid", "Awaiting Payment"],
    datasets: [
      {
        data: [50, 20], // sample data
        backgroundColor: ["#2ecc71", "#f39c12"],
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: "bottom" },
      title: { display: true, text: "Payment Status" },
    },
  };

  return <Pie data={data} options={options} />;
};

export default PaymentStatusChart;
