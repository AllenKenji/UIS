import { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";

const cleanText = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (["undefined", "null", "none", "nan"].includes(text.toLowerCase())) return null;
  return text;
};

// 🔧 Normalize Firestore/API field names to consistent snake_case
const normalizeDoc = (doc) => ({
  ...doc,
  document_id: doc.documentId || doc.document_id || doc.id,
  resident_id: doc.residentId || doc.resident_id,
  document_type: doc.documentType || doc.document_type,
  created_at: doc.createdAt || doc.created_at,
  updated_at: doc.updatedAt || doc.updated_at,
  reference_number: doc.referenceNumber ?? doc.reference_number,
  paymentStatus: doc.paymentStatus ?? doc.payment_status,
  issuedAt: doc.issuedAt ?? doc.issued_at,
  issuedBy: doc.issuedBy ?? doc.issued_by,
  fileUrl: doc.fileUrl ?? doc.file_url,
  transactionId: doc.transactionId ?? doc.transaction_id,
  paymentIntentId: doc.paymentIntentId ?? doc.payment_intent_id,
  remarks: cleanText(
    doc.remarks ??
    doc.remark ??
    doc.issueRemarks ??
    doc.issue_remarks ??
    doc.extraFields?.remarks ??
    null
  ),
});

export const useMyDocuments = (residentId) => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDocs = useCallback(async () => {
    if (!residentId) return; // guard against missing ID
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/api/documents/my`, {
        params: { resident_id: residentId },
      });
      // ✅ normalize before setting
      setDocs(res.data.map(normalizeDoc));
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      console.error("❌ Error fetching documents:", detail);
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, [residentId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  return { docs, loading, error, refresh: fetchDocs };
};
