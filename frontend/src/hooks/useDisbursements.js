import { useEffect, useState } from "react";
import { db } from "../services/firebase";
import { collection, onSnapshot } from "firebase/firestore";

export function useDisbursements() {
  const [disbursements, setDisbursements] = useState([]);
  const [totals, setTotals] = useState({ spent: 0, count: 0 });
  const [byCategory, setByCategory] = useState({});
  const [dailySummary, setDailySummary] = useState({});

  useEffect(() => {
    const disbursementsRef = collection(db, "disbursements");

    const unsubscribe = onSnapshot(disbursementsRef, snapshot => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));

      setDisbursements(data);
      setTotals(calculateTotals(data));
      setByCategory(calculateByCategory(data));
      setDailySummary(calculateDailySummary(data));
    });

    return () => unsubscribe();
  }, []);

  return { disbursements, totals, byCategory, dailySummary };
}

/* ----------------- Helper Functions ----------------- */

function calculateTotals(data) {
  const spent = data.reduce((sum, d) => sum + (d.amount || 0), 0);
  const count = data.length;
  return { spent, count };
}

function calculateByCategory(data) {
  return data.reduce((acc, d) => {
    const category = d.category || "Miscellaneous";
    acc[category] = (acc[category] || 0) + (d.amount || 0);
    return acc;
  }, {});
}

function calculateDailySummary(data) {
  return data.reduce((acc, d) => {
    const date = d.date instanceof Date 
      ? d.date 
      : d.date?.toDate?.() || new Date(d.date);

    if (!isNaN(date)) {
      const dateKey = date.toLocaleDateString();
      acc[dateKey] = (acc[dateKey] || 0) + (d.amount || 0);
    }
    return acc;
  }, {});
}
