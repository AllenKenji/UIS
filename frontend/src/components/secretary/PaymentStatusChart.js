import { useMemo } from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

const PaymentStatusChart = ({ documents = [] }) => {
  const { free, paid, awaiting_payment } = useMemo(() => {
    let free = 0;
    let paid = 0;
    let awaiting_payment = 0;

    documents.forEach((doc) => {
      const amount = doc.amount || 0;
      const status = doc.status || doc.documentStatus;

      if (amount === 0) {
        free += 1; 
      } else if (status === "paid" || status === "approved") {
        paid += 1;
      } else if (status === "awaiting_payment" || status === "pending") {
        awaiting_payment += 1;
      }
    });

    return { free, paid, awaiting_payment };
  }, [documents]);

  const data = {
    labels: ["Free", "Paid", "Awaiting Payment"],
    datasets: [
      {
        data: [free, paid, awaiting_payment],
        backgroundColor: ["#3498db", "#2ecc71", "#f39c12"], 
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" },
      title: { display: true, text: "Payment Status" },
    },
  };

  return <Pie data={data} options={options} />;
};

export default PaymentStatusChart;
