import { useEffect, useState } from "react";
import { db } from "../services/firebase";
import { collection, onSnapshot, query, where, getDocs } from "firebase/firestore";
import { auth } from "../services/firebase";
import { onAuthStateChanged } from "firebase/auth";

export function usePayments() {
  const [transactions, setTransactions] = useState([]);
  const [totals, setTotals] = useState({ collections: 0, pendingCount: 0, completedCount: 0, outstandingAmount: 0 });
  const [revenueByCategory, setRevenueByCategory] = useState({});
  const [dailySummary, setDailySummary] = useState({});
  const [canListen, setCanListen] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCanListen(Boolean(user));
      if (!user) {
        setTransactions([]);
        setTotals({ collections: 0, pendingCount: 0, completedCount: 0, outstandingAmount: 0 });
        setRevenueByCategory({});
        setDailySummary({});
      }
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!canListen) return;

    const paymentsRef = collection(db, "payments");
    const businessesRef = collection(db, "businesses");
    const documentsRef = collection(db, "documents");

    const unsubPayments = onSnapshot(
      paymentsRef,
      async snapshot => {
        const rawPayments = snapshot.docs.map(docSnap => ({ 
          id: docSnap.id, 
          entityType: "payment", 
          ...docSnap.data() 
        }));

        // Enrich with receipt numbers
        const enrichedPayments = await Promise.all(
          rawPayments.map(async tx => {
            if (tx.transactionId) {
              const receiptQuery = query(
                collection(db, "receipts"),
                where("transactionId", "==", tx.transactionId)
              );
              const receiptSnap = await getDocs(receiptQuery);
              if (!receiptSnap.empty) {
                tx.receiptNumber = receiptSnap.docs[0].data().receiptNumber;
              }
            }
            return tx;
          })
        );

        updateTransactions(enrichedPayments, "payment");
      },
      (err) => {
        console.error("❌ Payments listener failed:", err);
      }
    );

    const unsubBusinesses = onSnapshot(
      businessesRef,
      snapshot => {
        const pendingBiz = snapshot.docs
          .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
          .filter(b => b.paymentStatus === "unpaid" || b.status === "for_payment")
          .map(b => ({
            ...b,
            entityType: "business",
            amount: b.amount,
            paymentStatus: "unpaid",
          }));

        updateTransactions(pendingBiz, "business");
      },
      (err) => {
        console.error("❌ Businesses listener failed:", err);
      }
    );

    const unsubDocuments = onSnapshot(
      documentsRef,
      async snapshot => {
        const docs = await Promise.all(
          snapshot.docs.map(async docSnap => {
            const data = docSnap.data();
            let receiptNumber = "—";
            let method = data.method || "—";

            if (data.transactionId) {
              const receiptQuery = query(
                collection(db, "receipts"),
                where("transactionId", "==", data.transactionId)
              );
              const receiptSnap = await getDocs(receiptQuery);
              if (!receiptSnap.empty) {
                const receiptData = receiptSnap.docs[0].data();
                receiptNumber = receiptData.receiptNumber || receiptNumber;
                method = receiptData.method || method; // ✅ pull method from receipt if available
              }
            }

            return {
              id: docSnap.id,
              ...data,
              entityType: "document",
              entityCategory: data.documentType,
              ownerName: data.resident?.fullName,
              amount: data.amount,
              paymentStatus: data.paymentStatus || data.status || "unpaid",
              receiptNumber,
              method,
            };
          })
        );

        updateTransactions(docs, "document");
      },
      (err) => {
        console.error("❌ Documents listener failed:", err);
      }
    );



    return () => {
      unsubPayments();
      unsubBusinesses();
      unsubDocuments();
    };
  }, [canListen]);

  const updateTransactions = (newItems, type) => {
    setTransactions(prev => {
      const merged = [...prev.filter(t => t.entityType !== type), ...newItems];

      const map = new Map();
      for (const tx of merged) {
        const key = tx.transactionId || tx.id;

        // If a payment exists, prefer it over document/business
        if (!map.has(key)) {
          map.set(key, tx);
        } else {
          const existing = map.get(key);
          if (existing.entityType !== "payment" && tx.entityType === "payment") {
            map.set(key, tx);
          }
        }
      }

      const unique = Array.from(map.values());

      setTotals(calculateTotals(unique));
      setRevenueByCategory(calculateRevenueByCategory(unique));
      setDailySummary(calculateDailySummary(unique));
      return unique;
    });
  };


  return { transactions, totals, revenueByCategory, dailySummary };
}

/* ----------------- Helper Functions ----------------- */
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

