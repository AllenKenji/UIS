import { useMemo, useState } from "react";
import { usePayments } from "../../hooks/usePayments";
import "../../styles/treasurer/transactions-table.css";

function TransactionsTable() {
  const { transactions = [] } = usePayments();
  const [entityTab, setEntityTab] = useState("business");
  const [statusTab, setStatusTab] = useState("pending");

  const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

  const resolveEntityGroup = (tx) => {
    if (tx.entityType === "business") return "business";
    if (tx.entityType === "document") return "document";

    const feeType = String(tx.feeType || "").toLowerCase();
    if (tx.businessId || feeType.includes("business")) return "business";
    if (tx.documentId || feeType.includes("document")) return "document";

    return null;
  };

  const isPaidStatus = (tx) => {
    const status = normalizeStatus(tx.paymentStatus || tx.status);
    return status === "paid" || status === "approved";
  };

  const isPendingStatus = (tx) => {
    const status = normalizeStatus(tx.paymentStatus || tx.status);
    return ["pending", "for_payment", "awaiting_payment", "unpaid", "payment_submitted"].includes(status);
  };

  const getChannelLabel = (tx) => {
    const explicit = String(tx.method || tx.channel || "").trim();
    if (explicit) return explicit;

    const eventType = String(tx.eventType || "").toLowerCase();
    if (
      eventType.includes("paymongo") ||
      eventType.includes("payment.") ||
      eventType.includes("link.") ||
      tx.paymentIntentId ||
      tx.paymongoSourceId
    ) {
      return "PayMongo";
    }

    return isPaidStatus(tx) ? "Cash" : "—";
  };

  const getReceiptLabel = (tx) => {
    const receipt = String(tx.receiptNumber || "").trim();
    if (receipt) return receipt;
    return isPaidStatus(tx) ? "No receipt (legacy)" : "—";
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const group = resolveEntityGroup(tx);
      if (!group || group !== entityTab) return false;

      if (statusTab === "paid") return isPaidStatus(tx);
      return isPendingStatus(tx);
    });
  }, [transactions, entityTab, statusTab]);

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

      <div className="transactions-tabs" role="tablist" aria-label="Transaction entity tabs">
        <button
          role="tab"
          className={entityTab === "business" ? "active" : ""}
          aria-selected={entityTab === "business"}
          onClick={() => setEntityTab("business")}
        >
          🏢 Business Transactions
        </button>
        <button
          role="tab"
          className={entityTab === "document" ? "active" : ""}
          aria-selected={entityTab === "document"}
          onClick={() => setEntityTab("document")}
        >
          📄 Document Transactions
        </button>
      </div>

      <div className="transactions-tabs status-tabs" role="tablist" aria-label="Transaction status tabs">
        <button
          role="tab"
          className={statusTab === "pending" ? "active" : ""}
          aria-selected={statusTab === "pending"}
          onClick={() => setStatusTab("pending")}
        >
          ⏳ Pending
        </button>
        <button
          role="tab"
          className={statusTab === "paid" ? "active" : ""}
          aria-selected={statusTab === "paid"}
          onClick={() => setStatusTab("paid")}
        >
          ✅ Paid
        </button>
      </div>

      {filteredTransactions.length === 0 ? (
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
            {filteredTransactions.map((tx) => (
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
                <td>{getChannelLabel(tx)}</td>

                {/* Receipt Number (from receipts collection) */}
                <td>{getReceiptLabel(tx)}</td>

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
