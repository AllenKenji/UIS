import React from "react";
import FeeTracker from "../components/finance/FeeTracker";
import PaymentVerification from "../components/finance/PaymentVerification";
import FinancialReportPanel from "../components/finance/FinancialReportPanel";
import LedgerExport from "../components/finance/LedgerExport";
import "../styles/admin.css";

const TreasurerDashboard = () => {
  return (
    <section className="dashboard treasurer-dashboard">
      <header>
        <h2>💰 Treasurer Dashboard</h2>
        <p>Monitor fees, verify payments, and manage financial records.</p>
      </header>

      <div className="treasurer-tools">
        <section className="tool-section">
          <h3>📊 Fee Tracker</h3>
          <FeeTracker />
        </section>

        <section className="tool-section">
          <h3>✅ Payment Verification</h3>
          <PaymentVerification />
        </section>

        <section className="tool-section">
          <h3>📈 Financial Reports</h3>
          <FinancialReportPanel />
        </section>

        <section className="tool-section">
          <h3>📁 Ledger Export</h3>
          <LedgerExport />
        </section>
      </div>
    </section>
  );
};

export default TreasurerDashboard;
