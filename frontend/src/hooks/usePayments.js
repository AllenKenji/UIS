import { useEffect, useState } from "react";
import { ReportingAPI } from "../services/api";

export function usePayments() {
  const [transactions, setTransactions] = useState([]);
  const [totals, setTotals] = useState({ collections: 0, pendingCount: 0, completedCount: 0, outstandingAmount: 0 });
  const [revenueByCategory, setRevenueByCategory] = useState({});
  const [dailySummary, setDailySummary] = useState({});

  useEffect(() => {
    let isCurrent = true;

    const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

    const normalizeChannel = (tx = {}) => {
      const explicit = String(tx.method || tx.channel || "").trim();
      if (explicit) return explicit;

      const eventType = String(tx.eventType || "").toLowerCase();
      if (
        eventType.includes("paymongo") ||
        eventType.includes("link.") ||
        eventType.includes("payment.") ||
        tx.paymentIntentId ||
        tx.paymongoSourceId
      ) {
        return "PayMongo";
      }

      if (normalizeStatus(tx.paymentStatus || tx.status) === "paid") {
        return "Cash";
      }

      return "—";
    };

    const findReceipt = (receipts, { transactionId, businessId, documentId, referenceNumber }) => {
      return receipts.find((receipt) =>
        (transactionId && receipt.transactionId === transactionId) ||
        (businessId && receipt.businessId === businessId) ||
        (documentId && receipt.documentId === documentId) ||
        (referenceNumber && receipt.referenceNumber === referenceNumber)
      ) || null;
    };

    const loadTransactions = async () => {
      try {
        const [payments, receipts, businesses, documents] = await Promise.all([
          ReportingAPI.listTreasurerPayments(),
          ReportingAPI.listTreasurerReceipts(),
          ReportingAPI.listTreasurerBusinesses(),
          ReportingAPI.listTreasurerDocuments(),
        ]);

        const enrichedPayments = payments.map((tx) => {
          const receipt = findReceipt(receipts, tx);
          const method = tx.method || receipt?.method || tx.channel || null;
          return {
            ...tx,
            entityType: "payment",
            receiptNumber: tx.receiptNumber || receipt?.receiptNumber || null,
            method: normalizeChannel({ ...tx, method }),
          };
        });

        const pendingBusinesses = businesses
          .filter(b => b.paymentStatus === "unpaid" || b.status === "for_payment")
          .map(b => ({
            ...b,
            entityType: "business",
            amount: b.amount,
            paymentStatus: "unpaid",
          }));

        const enrichedDocuments = documents.map((document) => {
          const receipt = findReceipt(receipts, document);
          const method = document.method || receipt?.method || document.channel || null;
          return {
            ...document,
            entityType: "document",
            entityCategory: document.documentType,
            ownerName: document.resident?.fullName,
            paymentStatus: document.paymentStatus || document.status || "unpaid",
            receiptNumber: document.receiptNumber || receipt?.receiptNumber || null,
            method: normalizeChannel({ ...document, method }),
          };
        });

        const uniqueTransactions = mergeTransactions([
          ...enrichedPayments,
          ...pendingBusinesses,
          ...enrichedDocuments,
        ]);
        if (isCurrent) {
          setTransactions(uniqueTransactions);
          setTotals(calculateTotals(uniqueTransactions));
          setRevenueByCategory(calculateRevenueByCategory(uniqueTransactions));
          setDailySummary(calculateDailySummary(uniqueTransactions));
        }
      } catch (error) {
        console.error("Unable to load treasurer payments:", error);
      }
    };

    loadTransactions();
    const intervalId = window.setInterval(loadTransactions, 30000);

    return () => {
      isCurrent = false;
      window.clearInterval(intervalId);
    };
  }, []);


  return { transactions, totals, revenueByCategory, dailySummary };
}

/* ----------------- Helper Functions ----------------- */
function mergeTransactions(transactions) {
  const map = new Map();
  for (const transaction of transactions) {
    const key = transaction.transactionId || transaction.id;
    const existing = map.get(key);
    if (!existing || (existing.entityType !== "payment" && transaction.entityType === "payment")) {
      map.set(key, transaction);
    }
  }
  return Array.from(map.values());
}

function calculateTotals(data) {
  const collections = data
    .filter(d => d.status === "paid" || d.paymentStatus === "paid")
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const pendingCount = data.filter(
    d => d.paymentStatus === "unpaid" || d.status === "for_payment" || d.status === "pending"
  ).length;

  const completedCount = data.filter(
    d => d.status === "paid" || d.paymentStatus === "paid"
  ).length;

  const outstandingAmount = data
    .filter(d => d.paymentStatus === "unpaid" || d.status === "for_payment" || d.status === "pending")
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  return { collections, pendingCount, completedCount, outstandingAmount };
}


function calculateRevenueByCategory(data) {
  return data.reduce((acc, d) => {
    // Prefer entityCategory (e.g., "Activity Permit", "Business Clearance")
    const category = d.entityCategory || d.businessType || d.documentType || d.entityType || "Miscellaneous";

    if (!acc[category]) {
      acc[category] = { paid: 0, unpaid: 0 };
    }

    if (d.paymentStatus === "paid" || d.status === "paid") {
      acc[category].paid += d.amount || 0;
    } else if (d.paymentStatus === "unpaid" || d.status === "for_payment" || d.status === "pending") {
      acc[category].unpaid += d.amount || 0;
    }

    return acc;
  }, {});
}

function calculateDailySummary(data) {
  return data.reduce((acc, d) => {
    // ✅ If not paid, mark as "-"
    if (d.status === "pending" || d.paymentStatus === "unpaid" || d.status === "for_payment") {
      const dateKey = "-";
      acc[dateKey] = (acc[dateKey] || 0) + (d.amount || 0);
      return acc;
    }

    // ✅ Otherwise, use actual datePaid
    const date = d.datePaid instanceof Date 
      ? d.datePaid 
      : d.datePaid?.toDate?.() || (d.datePaid ? new Date(d.datePaid) : null);

    if (date && !isNaN(date)) {
      const dateKey = date.toLocaleDateString();
      acc[dateKey] = (acc[dateKey] || 0) + (d.amount || 0);
    }
    return acc;
  }, {});
}

