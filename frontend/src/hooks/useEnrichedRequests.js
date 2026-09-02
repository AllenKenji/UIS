import { useEffect, useState } from "react";
import { DocumentsAPI } from "../services/api";   
import { useUser } from "../context/UserContext";

const normalizeStatus = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

const toReadableError = (err, fallback = "Failed to load document requests.") => {
  const message = String(err?.message || "").trim();
  const lowered = message.toLowerCase();
  const isGeneric = !message || lowered === "unknown error" || lowered === "unexpected error format";

  if (!isGeneric) {
    return message;
  }

  const status = err?.status ? ` (HTTP ${err.status})` : "";
  const context = err?.context ? ` [${err.context}]` : "";
  return `${fallback}${status}${context}`;
};

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

export const useEnrichedRequests = () => {
  const [pending, setPending] = useState([]);
  const [toVerify, setToVerify] = useState([]);
  const [readyToIssue, setReadyToIssue] = useState([]);
  const [approved, setApproved] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { isAuthenticated } = useUser();

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
            return { ...doc, resident_name: existingName, residentName: existingName };
          })
        );

      setPending(await enrich(normalized.filter((doc) => normalizeStatus(doc.status) === "pending")));
      setToVerify(await enrich(normalized.filter((doc) => normalizeStatus(doc.status) === "payment_submitted")));
      setReadyToIssue(await enrich(
        normalized.filter((doc) => normalizeStatus(doc.status) === "paid")
      ));
      setApproved(await enrich(normalized.filter((doc) => normalizeStatus(doc.status) === "approved")));
    } catch (err) {
      console.error("❌ Error fetching requests:", err);
      setError(toReadableError(err, "Failed to load secretary document requests."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchRequests();
    }
  }, [isAuthenticated]);


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
