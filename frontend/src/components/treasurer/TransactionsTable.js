import React from "react";
import { usePayments } from "../../hooks/usePayments";

function TransactionsTable() {
  const { transactions } = usePayments();

  return (
    <div className="transactions-table">
      <h2>Recent Transactions</h2>
      <table>
        <thead>
          <tr>
            <th>Resident/Business</th>
            <th>Fee Type</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Channel</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(tx => (
            <tr key={tx.referenceNumber}>
              <td>{tx.name}</td>
              <td>{tx.feeType}</td>
              <td>₱{tx.amount}</td>
              <td>{tx.status}</td>
              <td>{tx.channel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default TransactionsTable;
