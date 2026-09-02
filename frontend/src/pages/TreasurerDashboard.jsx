import SummaryCards from "../components/treasurer/SummaryCards";
import RevenueChart from "../components/treasurer/RevenueChart";
import TransactionsTable from "../components/treasurer/TransactionsTable";
import DisbursementTable from "../components/treasurer/DisbursementTable";
import ReportsSection from "../components/treasurer/ReportsSection";
import "../styles/treasurer.css"
import "../styles/dashboard/role-dashboard.css";

function TreasurerDashboard() {
  return (
    <section className="dashboard treasurer-dashboard role-dashboard role-treasurer" aria-label="Treasurer Dashboard">
      <header className="dashboard-header">
        <h2>💰 Treasurer Dashboard</h2>
        <p>Monitor collections, disbursements, and financial reporting.</p>
      </header>
      <SummaryCards />
      <RevenueChart />
      <TransactionsTable />
      <DisbursementTable />
      <ReportsSection />
    </section>
  );
}

export default TreasurerDashboard;
