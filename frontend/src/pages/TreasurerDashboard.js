import React from "react";
import SummaryCards from "../components/treasurer/SummaryCards";
import RevenueChart from "../components/treasurer/RevenueChart";
import TransactionsTable from "../components/treasurer/TransactionsTable";
import DisbursementTable from "../components/treasurer/DisbursementTable";
import ReportsSection from "../components/treasurer/ReportsSection";
import "../styles/treasurer.css"

function TreasurerDashboard() {
  return (
    <div className="treasurer-dashboard">
      <h1>Treasurer Dashboard</h1>
      <SummaryCards />
      <RevenueChart />
      <TransactionsTable />
      <DisbursementTable />
      <ReportsSection />
    </div>
  );
}

export default TreasurerDashboard;
