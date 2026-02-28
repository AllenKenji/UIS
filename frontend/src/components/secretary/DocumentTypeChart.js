import { useMemo } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const DocumentTypeChart = ({ documents = [], counters = [] }) => {
  const { labels, counts } = useMemo(() => {
    // Case 1: Use documents if available
    if (documents && documents.length > 0) {
      const map = {};
      documents.forEach((doc) => {
        const type = doc.document_type || doc.documentType;
        if (!type) return;
        map[type] = (map[type] || 0) + 1;
      });
      return { labels: Object.keys(map), counts: Object.values(map) };
    }

    // Case 2: Fallback to counters if documents are empty
    if (counters && counters.length > 0) {
      const labels = counters.map((c) => c.id || c.documentType);
      const counts = counters.map((c) => c.last_number || 0);
      return { labels, counts };
    }

    // Case 3: No data
    return { labels: [], counts: [] };
  }, [documents, counters]);

  const data = {
    labels,
    datasets: [
      {
        label: "Requests",
        data: counts,
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
