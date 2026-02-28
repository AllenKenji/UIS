import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";

export const useDocumentCounters = () => {
  const [counters, setCounters] = useState([]);

  useEffect(() => {
    const ref = collection(db, "counters");

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setCounters(docs);
    });

    return () => unsubscribe();
  }, []);

  return counters;
};
