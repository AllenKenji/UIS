import { useEffect, useState } from "react";
import { db } from "../services/firebase";
import { collection, onSnapshot } from "firebase/firestore";

export function useDisbursements() {
  const [disbursements, setDisbursements] = useState([]);
  const [totals, setTotals] = useState({ spent: 0 });

  useEffect(() => {
    const disbursementsRef = collection(db, "disbursements");

    const unsubscribe = onSnapshot(disbursementsRef, snapshot => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDisbursements(data);

      const spent = data.reduce((sum, d) => sum + d.amount, 0);
      setTotals({ spent });
    });

    return () => unsubscribe();
  }, []);

  return { disbursements, totals };
}
