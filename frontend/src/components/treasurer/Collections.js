import React from "react";
import { usePayments } from "../../hooks/usePayments";
import SummaryCards from "./SummaryCards";
import CategoryList from "./CategoryList";
import TransactionsTable from "./TransactionsTable";

function Collections() {
  const { transactions = [], totals, revenueByCategory } = usePayments();

  return (
    <div className="treasurer-main">
      <header>
        <h1>Barangay Collections</h1>
      </header>

      {/* Summary Section */}
      <SummaryCards totals={totals} />

      {/* Revenue by Category */}
      <CategoryList revenueByCategory={revenueByCategory} />

      {/* Transactions Table */}
      <TransactionsTable transactions={transactions} />
    </div>
  );
}

export default Collections;
