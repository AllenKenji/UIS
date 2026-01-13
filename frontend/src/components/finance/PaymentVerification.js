import React from "react";
import "../../styles/admin.css";

const mockPayments = [
  { id: 1, payer: "Juan Dela Cruz", reference: "TXN-001", verified: false },
  { id: 2, payer: "Maria Santos", reference: "TXN-002", verified: true },
];

const PaymentVerification = () => {
  const handleVerify = (id) => {
    console.log("Verified payment:", id);
    // TODO: Update Firestore status
  };

  return (
    <div className="payment-verification">
      <h3>✅ Payment Verification</h3>
      <table>
        <thead>
          <tr>
            <th>Payer</th>
            <th>Reference</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {mockPayments.map((p) => (
            <tr key={p.id}>
              <td>{p.payer}</td>
              <td>{p.reference}</td>
              <td>{p.verified ? "Verified" : "Pending"}</td>
              <td>
                {!p.verified && (
                  <button onClick={() => handleVerify(p.id)}>Verify</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PaymentVerification;
