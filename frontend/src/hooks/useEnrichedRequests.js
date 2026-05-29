import { useEffect, useState } from "react";
import { DocumentsAPI } from "../services/api";   
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../services/firebase";

const normalizeStatus = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

const normalizeDoc = (doc) => ({
  ...doc,
  status: normalizeStatus(doc.status),
  documentId: doc.documentId || doc.document_id || doc.id,
  document_id: doc.documentId || doc.document_id || doc.id,
  residentId: doc.residentId || doc.resident_id,
  resident_id: doc.residentId || doc.resident_id,
  residentName: doc.residentName || doc.resident_name || doc.fullName || doc.name || null,
  resident_name: doc.residentName || doc.resident_name || doc.fullName || doc.name || null,
  documentType: doc.documentType || doc.document_type,
  document_type: doc.documentType || doc.document_type,
  created_at: doc.createdAt || doc.created_at,
  updated_at: doc.updatedAt || doc.updated_at,
  paymentStatus: doc.paymentStatus ?? doc.payment_status,
  transactionId: doc.transactionId ?? doc.transaction_id,       
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
      const data = await DocumentsAPI.list();
      const list = Array.isArray(data) ? data : data?.items || data?.results || [];
      if (!Array.isArray(list)) {
        throw new Error("Unexpected documents response format.");
      }
      const normalized = list.map(normalizeDoc);

      const enrich = async (docs) =>
        Promise.all(
          docs.map(async (doc) => {
            const existingName = doc.residentName || doc.resident_name;
            const name = existingName || await getResidentName(doc.resident_id || doc.residentId);
            return { ...doc, resident_name: name, residentName: name };
          })
        );

      setPending(await enrich(normalized.filter((doc) => normalizeStatus(doc.status) === "pending")));
      setToVerify(await enrich(normalized.filter((doc) => normalizeStatus(doc.status) === "payment_submitted")));
      setReadyToIssue(await enrich(
        normalized.filter((doc) => normalizeStatus(doc.status) === "paid")
      ));
      setApproved(await enrich(normalized.filter((doc) => normalizeStatus(doc.status) === "approved")));
    } catch (err) {
      console.error("❌ Error fetching requests:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getAuth(), async (user) => {
      if (!user) {
        setAuthReady(false);
        return;
      }

      try {
        await user.getIdToken(true);
      } catch (err) {
        console.warn("⚠️ Failed to refresh auth token for document requests:", err?.message || err);
      } finally {
        // Continue loading requests even if token refresh fails; axios interceptor can still attach cached token.
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
