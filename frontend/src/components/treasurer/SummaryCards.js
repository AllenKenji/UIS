import React from "react";
import { usePayments } from "../../hooks/usePayments";

function SummaryCards() {
  const { totals } = usePayments();

  return (
    <div className="summary-cards">
      <div className="card">Total Collections: ₱{totals.collections}</div>
      <div className="card">Pending Payments: {totals.pending}</div>
      <div className="card">Completed Payments: {totals.completed}</div>
      <div className="card">Outstanding Balances: ₱{totals.outstanding}</div>
    </div>
  );
}

export default SummaryCards;
