import React from "react";
import SummaryCards from "../components/secretary/SummaryCards";
import DocumentTypeChart from "../components/secretary/DocumentTypeChart";
import PaymentStatusChart from "../components/secretary/PaymentStatusChart";
import MonthlyTrendChart from "../components/secretary/MonthlyTrendChart";
import "../styles/secretary.css";

const SecretaryDashboard = () => {
  const stats = {
    total: 120,
    pending: 35,
    awaiting_payment: 20,
    approved: 50,
    rejected: 15,
  };

  return (
    <section className="dashboard secretary-dashboard">
      <header>
        <h2>📑 Secretary Dashboard</h2>
        <p>Overview of resident requests and payment facilitation.</p>
      </header>

      {/* Summary cards at the top */}
      <SummaryCards stats={stats} />

      {/* Charts section */}
      <div className="charts-container">
        <section className="chart-section">
          <h3>📊 Document Types Requested</h3>
          <DocumentTypeChart />
        </section>

        <section className="chart-section">
          <h3>💵 Payment Status</h3>
          <PaymentStatusChart />
        </section>

        <section className="chart-section">
          <h3>📈 Monthly Request Trends</h3>
          <MonthlyTrendChart />
        </section>
      </div>
    </section>
  );
};

export default SecretaryDashboard;
