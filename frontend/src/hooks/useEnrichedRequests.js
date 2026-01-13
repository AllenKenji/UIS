import { useEffect, useState } from "react";
import { api } from "../services/api";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../services/firebase";

const getResidentName = async (uid) => {
  try {
    const snap = await getDoc(doc(db, "residents", uid));
    return snap.exists() ? snap.data().fullName : null;
  } catch (err) {
    console.error(`❌ Failed to fetch resident name for ${uid}:`, err.message);
    return null;
  }
};

export const useEnrichedRequests = () => {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchPending = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/documents");
      const pendingDocs = data.filter((doc) => doc.status === "pending");

      const enriched = await Promise.all(
        pendingDocs.map(async (doc) => {
          const name = await getResidentName(doc.resident_id);
          return { ...doc, resident_name: name };
        })
      );

      setPending(enriched);
    } catch (err) {
      console.error("❌ Error fetching pending requests:", err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  return { pending, loading, fetchPending };
};
