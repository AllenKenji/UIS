import { useAllDocuments } from "../hooks/useAllDocuments";
import { useDocumentCounters } from "../hooks/useDocumentCounters"; 
import { useFirestoreStats } from "../hooks/useFirestoreStats";
import SummaryCards from "../components/secretary/SummaryCards";
import DocumentTypeChart from "../components/secretary/DocumentTypeChart";
import PaymentStatusChart from "../components/secretary/PaymentStatusChart";
import MonthlyTrendChart from "../components/secretary/MonthlyTrendChart";
import "../styles/secretary.css"

const SecretaryDashboard = () => {
  const { docs: documents } = useAllDocuments();
  const counters = useDocumentCounters();
  const statusStats = useFirestoreStats("documents", "status", [
    "pending",
    "awaiting_payment",
    "approved",
    "rejected",
  ]);

  const stats = {
    total: counters.reduce((sum, c) => sum + (c.last_number || 0), 0),
    ...statusStats,
  };

  return (
    <section className="dashboard secretary-dashboard">
      <header>
        <h2>📑 Secretary Dashboard</h2>
        <p>Overview of resident requests and payment facilitation.</p>
      </header>

      <SummaryCards stats={stats} />

      <div className="charts-container">
        <section className="chart-section">
          <h3>📊 Document Types Requested</h3>
          <div style={{ width: "100%", height: "400px" }}>
            <DocumentTypeChart documents={documents} counters={counters} />
          </div>
        </section>

        <section className="chart-section">
          <h3>💵 Payment Status</h3>
          <div style={{ width: "100%", height: "400px" }}>
            <PaymentStatusChart documents={documents} />
          </div>
        </section>

        <section className="chart-section">
          <h3>📈 Monthly Request Trends</h3>
          <div style={{ width: "100%", height: "450px" }}>
            <MonthlyTrendChart documents={documents} />
          </div>
        </section>
      </div>
    </section>
  );
};

export default SecretaryDashboard;
