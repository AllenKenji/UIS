import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase"; // adjust path if needed

/**
 * Generic Firestore collection listener
 * @param {string} collectionName - Firestore collection to listen to
 * @returns {Array} documents - Array of { id, ...data }
 */
export const useFirestoreCollection = (collectionName) => {
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    const ref = collection(db, collectionName);

    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setDocuments(docs);
    });

    return () => unsubscribe();
  }, [collectionName]);

  return documents;
};
