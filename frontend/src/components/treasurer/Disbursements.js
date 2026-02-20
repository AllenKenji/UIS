import React, { useState } from "react";
import { useDisbursements } from "../../hooks/useDisbursements";
import DisbursementForm from "../forms/DisbursementForm";

function Disbursements() {
  const { disbursements = [], totals = {}, byCategory = {} } = useDisbursements();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="treasurer-main">
      <header className="header">
        <h1>Disbursements</h1>
        <button className="add-btn" onClick={() => setShowModal(true)}>
          + Add Disbursement
        </button>
      </header>

      {showModal && <DisbursementForm onClose={() => setShowModal(false)} />}

      {/* Summary Section */}
      <section className="summary">
        <h2>Summary</h2>
        <ul>
          <li><strong>Total Disbursed:</strong> ₱{totals.spent?.toLocaleString() || 0}</li>
          <li><strong>Transactions:</strong> {totals.count || disbursements.length}</li>
        </ul>
      </section>

      {/* Category Breakdown */}
      <section className="categories">
        <h2>By Category</h2>
        {Object.keys(byCategory).length === 0 ? (
          <p>No disbursements recorded yet.</p>
        ) : (
          <ul>
            {Object.entries(byCategory).map(([category, amount]) => (
              <li key={category}>{category}: ₱{amount.toLocaleString()}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Detailed Transactions */}
      <section className="transactions">
        <h2>Transaction Details</h2>
        {disbursements.length === 0 ? (
          <p>No transactions available.</p>
        ) : (
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Reference ID</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Recipient</th>
                <th>Processed By</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {disbursements.map(d => (
                <tr key={d.id}>
                  <td>{d.referenceNo || d.id}</td>
                  <td>{d.category || "Miscellaneous"}</td>
                  <td>₱{(d.amount || 0).toLocaleString()}</td>
                  <td>{d.date ? new Date(d.date).toLocaleDateString() : "—"}</td>
                  <td>{d.recipient || "—"}</td>
                  <td>{d.processedBy || "—"}</td>
                  <td>{d.status || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default Disbursements;
