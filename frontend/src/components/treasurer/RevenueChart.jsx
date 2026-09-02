import { usePayments } from "../../hooks/usePayments";
import { Bar } from "react-chartjs-2";
import { useTheme } from "../../context/ThemeContext"; 

function RevenueChart() {
  const { revenueByCategory } = usePayments();
  const { isDarkMode } = useTheme(); 

  if (!revenueByCategory || Object.keys(revenueByCategory).length === 0) {
    return <p>No revenue data available</p>;
  }

  // 🎨 Define colors based on theme
  const textColor = isDarkMode ? "#ffffff" : "#000000";
  const bgColorPaid = isDarkMode ? "rgba(75,192,192,0.8)" : "rgba(75,192,192,0.6)";
  const bgColorUnpaid = isDarkMode ? "rgba(255,99,132,0.8)" : "rgba(255,99,132,0.6)";
  const containerBg = isDarkMode ? "#222" : "#fff";

  const data = {
    labels: Object.keys(revenueByCategory),
    datasets: [
      {
        label: "Collected Revenue",
        data: Object.values(revenueByCategory).map(c => c.paid),
        backgroundColor: bgColorPaid
      },
      {
        label: "Outstanding Balance",
        data: Object.values(revenueByCategory).map(c => c.unpaid),
        backgroundColor: bgColorUnpaid
      }
    ]
  };

  const options = {
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        callbacks: {
          label: (context) => `₱${context.raw.toLocaleString()}`
        }
      },
      legend: {
        labels: {
          color: textColor 
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: "Amount (₱)", color: textColor },
        ticks: { color: textColor }
      },
      x: {
        title: { display: true, text: "Category", color: textColor },
        ticks: { color: textColor }
      }
    }
  };

  return (
    <div
      className="revenue-chart"
      style={{
        maxWidth: "600px",
        height: "300px",
        backgroundColor: containerBg,
        color: textColor,
        padding: "1rem",
        borderRadius: "8px"
      }}
    >
      <h2>Revenue Breakdown</h2>
      <Bar data={data} options={options} />
    </div>
  );
}

export default RevenueChart;
