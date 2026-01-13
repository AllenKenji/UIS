import React from "react";
import "../../styles/admin.css";

const mockFees = [
  { id: 1, category: "Business Permit", amount: 500, status: "Unpaid" },
  { id: 2, category: "Barangay Clearance", amount: 100, status: "Paid" },
];

const FeeTracker = () => (
  <div className="fee-tracker">
    <h3>📊 Fee Tracker</h3>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {mockFees.map((fee) => (
          <tr key={fee.id}>
            <td>{fee.category}</td>
            <td>₱{fee.amount}</td>
            <td>{fee.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default FeeTracker;
