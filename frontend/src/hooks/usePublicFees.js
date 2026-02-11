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

  // 🔧 Helper to compute totals conditionally
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
        // Resident‑safe endpoints
        const [bizRes, docRes] = await Promise.all([
          fetch("/api/fees/public/businesses"),
          fetch("/api/fees/public/documents"),
        ]);

        if (!bizRes.ok || !docRes.ok) {
          throw new Error("Failed to fetch public fees");
        }

        const bizData = await bizRes.json();
        const docData = await docRes.json();

        const rawBusinesses = Array.isArray(bizData) ? bizData : bizData?.data || [];
        const rawDocuments = Array.isArray(docData) ? docData : docData?.data || [];

        setBusinessTypes(rawBusinesses.map(computeBusinessTotals));
        setDocumentTypes(rawDocuments.map(computeDocumentTotals));
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

  return {
    businessTypes,
    documentTypes,
    loading,
    error,
  };
}
