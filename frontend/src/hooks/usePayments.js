import { useEffect, useState } from "react";
import { db } from "../services/firebase"; // your config file
import { collection, onSnapshot } from "firebase/firestore";

export function usePayments() {
  const [transactions, setTransactions] = useState([]);
  const [totals, setTotals] = useState({
    collections: 0,
    pending: 0,
    completed: 0,
    outstanding: 0
  });
  const [revenueByCategory, setRevenueByCategory] = useState({});

  useEffect(() => {
    const paymentsRef = collection(db, "payments");

    const unsubscribe = onSnapshot(paymentsRef, snapshot => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(data);

      const collections = data.reduce((sum, d) => sum + d.amount, 0);
      const pending = data.filter(d => d.status === "awaiting_payment").length;
      const completed = data.filter(d => d.status === "paid").length;
      const outstanding = data
        .filter(d => d.status === "unpaid")
        .reduce((sum, d) => sum + d.amount, 0);

      setTotals({ collections, pending, completed, outstanding });

      const byCategory = {};
      data.forEach(d => {
        byCategory[d.feeType] = (byCategory[d.feeType] || 0) + d.amount;
      });
      setRevenueByCategory(byCategory);
    });

    return () => unsubscribe();
  }, []);

  return { transactions, totals, revenueByCategory };
}
