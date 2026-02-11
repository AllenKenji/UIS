import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";

/**
 * Subscribe to a Firestore collection and return aggregated stats by status
 * @param {string} collectionName - Firestore collection name
 * @param {string} statusField - Field name in documents that represents status
 * @param {Array<string>} statuses - List of statuses to track
 */
export const useFirestoreStats = (
  collectionName,
  statusField = "status",
  statuses = []
) => {
  const [stats, setStats] = useState({ total: 0 });

  useEffect(() => {
    const ref = collection(db, collectionName);

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const counts = { total: snapshot.size };

      // Initialize counts
      statuses.forEach((s) => (counts[s] = 0));

      snapshot.forEach((doc) => {
        const data = doc.data();
        const status = data[statusField];
        if (status && counts[status] !== undefined) {
          counts[status]++;
        }
      });

      setStats(counts);
    });

    return () => unsubscribe();
  }, [collectionName, statusField, statuses]);

  return stats;
};
