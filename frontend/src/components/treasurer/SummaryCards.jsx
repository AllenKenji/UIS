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
  const { transactions = [] } = usePayments();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthLabel = monthStart.toLocaleString("default", { month: "long", year: "numeric" });

  const normalizeDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === "function") return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const resolveTransactionDate = (tx) => {
    const dateCandidates = [
      tx.datePaid,
      tx.paidAt,
      tx.paymentDate,
      tx.createdAt,
      tx.date,
      tx.updatedAt,
    ];

    for (const candidate of dateCandidates) {
      const parsed = normalizeDate(candidate);
      if (parsed) return parsed;
    }

    return null;
  };

  const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
  const isPaid = (tx) => {
    const status = normalizeStatus(tx.paymentStatus || tx.status);
    return status === "paid" || status === "succeeded";
  };
  const isPending = (tx) => {
    const status = normalizeStatus(tx.paymentStatus || tx.status);
    return ["pending", "for_payment", "awaiting_payment", "unpaid", "payment_submitted"].includes(status);
  };

  const monthlyTransactions = transactions.filter((tx) => {
    const txDate = resolveTransactionDate(tx);
    if (!txDate) return false;
    return txDate >= monthStart && txDate < nextMonthStart;
  });

  const collections = monthlyTransactions
    .filter(isPaid)
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const completedCount = monthlyTransactions.filter(isPaid).length;
  const pendingCount = monthlyTransactions.filter(isPending).length;
  const outstandingAmount = monthlyTransactions
    .filter(isPending)
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  return (
    <div className="summary-cards">
      <SummaryCard 
        title={`Collections (${monthLabel})`} 
        value={`₱${collections.toLocaleString()}`} 
        icon="💰" 
      />
      <SummaryCard 
        title={`Completed Payments (${monthLabel})`} 
        value={completedCount} 
        icon="✅" 
      />
      <SummaryCard 
        title={`Pending Payments (${monthLabel})`} 
        value={pendingCount} 
        icon="⏳" 
      />
      <SummaryCard 
        title={`Outstanding Balances (${monthLabel})`} 
        value={`₱${outstandingAmount.toLocaleString()}`} 
        icon="⚠️" 
      />
    </div>
  );
}

export default SummaryCards;
