import { usePayments } from "../../hooks/usePayments";
import "../../styles/treasurer/summary-cards.css";

function SummaryCard({ title, value, icon }) {
  return (
    <div className="card">
      <span className="card-icon">{icon}</span>
      <div className="card-content">
        <h3>{title}</h3>
        <p>{value}</p>
      </div>
    </div>
  );
}

function SummaryCards() {
  const { totals } = usePayments();

  // Provide safe fallbacks
  const collections = totals?.collections ?? 0;
  const pendingCount = totals?.pendingCount ?? 0;
  const completedCount = totals?.completedCount ?? 0;
  const outstandingAmount = totals?.outstandingAmount ?? 0;

  return (
    <div className="summary-cards">
      <SummaryCard 
        title="Total Collections" 
        value={`₱${collections.toLocaleString()}`} 
        icon="💰" 
      />
      <SummaryCard 
        title="Completed Payments" 
        value={completedCount} 
        icon="✅" 
      />
      <SummaryCard 
        title="Pending Payments" 
        value={pendingCount} 
        icon="⏳" 
      />
      <SummaryCard 
        title="Outstanding Balances" 
        value={`₱${outstandingAmount.toLocaleString()}`} 
        icon="⚠️" 
      />
    </div>
  );
}

export default SummaryCards;
