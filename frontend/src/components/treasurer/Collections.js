import React from "react";
import { usePayments } from "../../hooks/usePayments";

function Collections() {
  const { transactions } = usePayments();

  return (
    <div className="treasurer-main">
      <h1>Collections</h1>
      <ul>
        {transactions.map(tx => (
          <li key={tx.id}>
            {tx.name} — ₱{tx.amount} ({tx.status})
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Collections;
