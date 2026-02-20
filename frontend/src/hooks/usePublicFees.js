// src/hooks/usePublicFees.js
import { useState, useEffect } from "react";

/**
 * Hook for residents: fetches public business/document fees
 * from /api/fees/public/... endpoints and computes totals.
 */
export function usePublicFees() {
  const [businessTypes, setBusinessTypes] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 🔧 Helper to compute totals for businesses
  const computeBusinessTotals = (bt) => {
    const baseFee = bt.fee || 0;
    const registrationFee = bt.registrationFee || 0;
    const annualFee = bt.annualFee || 0;
    const miscFee = bt.miscFeeResolved || 0;
    const enabled = bt.enabled ?? false;

    return {
      ...bt,
      registrationTotal: baseFee + registrationFee + (enabled ? miscFee : 0),
      annualTotal: baseFee + annualFee + (enabled ? miscFee : 0),
    };
  };

  // 🔧 Helper to compute totals for documents
  const computeDocumentTotals = (doc) => {
    const baseFee = doc.fee || 0;
    const miscFee = doc.miscFeeResolved || 0;
    const enabled = doc.enabled ?? false;

    return {
      ...doc,
      totalFee: baseFee + (enabled ? miscFee : 0),
    };
  };

  useEffect(() => {
    const fetchPublicFees = async () => {
      setLoading(true);
      setError(null);

      try {
        const [bizRes, docRes] = await Promise.allSettled([
          fetch("/api/fees/public/businesses"),
          fetch("/api/fees/public/documents"),
        ]);

        // ✅ Handle businesses
        if (bizRes.status === "fulfilled" && bizRes.value.ok) {
          const bizData = await bizRes.value.json();
          const rawBusinesses = Array.isArray(bizData?.data)
            ? bizData.data
            : Array.isArray(bizData)
            ? bizData
            : [];
          setBusinessTypes(rawBusinesses.map(computeBusinessTotals));
        } else {
          console.warn("⚠️ Failed to fetch business fees");
          setBusinessTypes([]);
        }

        // ✅ Handle documents
        if (docRes.status === "fulfilled" && docRes.value.ok) {
          const docData = await docRes.value.json();
          const rawDocuments = Array.isArray(docData?.data)
            ? docData.data
            : Array.isArray(docData)
            ? docData
            : [];
          setDocumentTypes(rawDocuments.map(computeDocumentTotals));
        } else {
          console.warn("⚠️ Failed to fetch document fees");
          setDocumentTypes([]);
        }
      } catch (err) {
        console.error("❌ Error fetching public fees:", err);
        setError(err.message || "Failed to load public fees");
        setBusinessTypes([]);
        setDocumentTypes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPublicFees();
  }, []);

  // 🔎 Lookup helpers
  const getBusinessFee = (type) =>
    businessTypes.find((b) => b.type === type) || null;
  const getDocumentFee = (type) =>
    documentTypes.find((d) => d.type === type) || null;

  return {
    businessTypes,
    documentTypes,
    getBusinessFee,
    getDocumentFee,
    loading,
    error,
  };
}
