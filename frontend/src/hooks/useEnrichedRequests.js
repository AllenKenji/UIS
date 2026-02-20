import { useEffect, useState } from "react";
import { DocumentsAPI } from "../services/api";   // ✅ use centralized API
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../services/firebase";

const normalizeDoc = (doc) => ({
  ...doc,
  document_id: doc.documentId || doc.document_id || doc.id,
  resident_id: doc.residentId || doc.resident_id,
  document_type: doc.documentType || doc.document_type,
  created_at: doc.createdAt || doc.created_at,
  updated_at: doc.updatedAt || doc.updated_at,
  paymentStatus: doc.paymentStatus ?? doc.payment_status,
  transactionId: doc.transactionId ?? doc.transaction_id,       // use ?? not ||
  paymentIntentId: doc.paymentIntentId ?? doc.payment_intent_id,
  referenceNumber: doc.referenceNumber ?? doc.reference_number,
  attachments: doc.attachments ?? {},
});

const getResidentName = async (uid) => {
  if (!uid) return null;
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
  const [toVerify, setToVerify] = useState([]);
  const [readyToIssue, setReadyToIssue] = useState([]);
  const [approved, setApproved] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await DocumentsAPI.list();   // ✅ use centralized API
      const normalized = data.map(normalizeDoc);

      const enrich = async (docs) =>
        Promise.all(
          docs.map(async (doc) => {
            const name = await getResidentName(doc.resident_id);
            return { ...doc, resident_name: name };
          })
        );

      setPending(await enrich(normalized.filter((doc) => doc.status === "pending")));
      setToVerify(await enrich(normalized.filter((doc) => doc.status === "payment_submitted")));
      setReadyToIssue(await enrich(
        normalized.filter((doc) => doc.status === "paid")
      ));
      setApproved(await enrich(normalized.filter((doc) => doc.status === "approved")));
    } catch (err) {
      console.error("❌ Error fetching requests:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (user) {
        await user.getIdToken(true);
        setAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (authReady) {
      fetchRequests();
    }
  }, [authReady]);


  return {
    pending,
    toVerify,
    readyToIssue,
    approved,
    loading,
    error,
    fetchRequests,
  };
};
