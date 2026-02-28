import { usePayments } from "../../hooks/usePayments";
import "../../styles/treasurer/transactions-table.css";

function TransactionsTable() {
  const { transactions = [] } = usePayments();

  const formatDate = (dateValue) => {
    if (!dateValue) return "—";

    // Firestore Timestamp object
    if (dateValue?.toDate) {
      return new Date(dateValue.toDate()).toLocaleDateString();
    }

    // JS Date object
    if (dateValue instanceof Date) {
      return dateValue.toLocaleDateString();
    }

    // ISO string or millis
    try {
      return new Date(dateValue).toLocaleDateString();
    } catch {
      return "—";
    }
  };

  return (
    <div className="transactions-table">
      <h2>Recent Transactions</h2>

      {transactions.length === 0 ? (
        <p>No transactions available.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Business Name / Document</th>
              <th>Owner Name</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Channel</th>
              <th>Receipt #</th>
              <th>Date Paid</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr
                key={tx.customPaymentId || tx.id}
                className={`status-${tx.paymentStatus || tx.status}`}
              >
                {/* Business Name */}
                <td>{tx.businessName || "Barangay document"}</td>

                {/* Owner Name */}
                <td>{tx.ownerName || tx.residentName || "Unknown"}</td>

                {/* Entity Type/Category */}
                <td>{tx.entityCategory || tx.businessType || tx.documentType || tx.description || "—"}</td>

                {/* Amount */}
                <td>₱{(tx.amount || 0).toLocaleString()}</td>

                {/* Status */}
                <td>{tx.paymentStatus || tx.status || "—"}</td>

                {/* Channel */}
                <td>{tx.method || tx.channel || "Cash / PayMongo"}</td>

                {/* Receipt Number (from receipts collection) */}
                <td>{tx.receiptNumber || "—"}</td>

                {/* Date Paid */}
                <td>
                  {(tx.paymentStatus === "paid" || tx.status === "paid")
                    ? formatDate(tx.datePaid || tx.createdAt)
                    : "—"}
                </td> 

              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default TransactionsTable;
