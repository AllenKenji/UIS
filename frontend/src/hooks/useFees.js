import { useState, useEffect, useCallback } from "react";
import { FeesAPI } from "../services/api";
import {
  buildDocumentPayload,
  buildBusinessPayload,
  buildMiscPayload,
  buildUsageMiscPayload,
} from "../utils/payloadBuilders";

export function useFees(delayMs = 500, options = {}) {
  // `barangayId` lets a super_admin scope this hook to one barangay's fees
  // (instead of the caller's own, token-scoped barangay); `enabled` lets
  // callers hold off fetching until a barangay has actually been picked.
  const { barangayId, enabled = true } = options;
  const [documentFees, setDocumentFees] = useState([]);
  const [businessFees, setBusinessFees] = useState([]);
  const [miscFees, setMiscFees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleError = (err, fallbackMsg) => {
    console.error(err);
    setError(err?.message || fallbackMsg);
  };

  const refreshData = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const params = barangayId ? { barangayId } : {};
      const [docs, businesses, misc] = await Promise.all([
        FeesAPI.listDocuments(params),
        FeesAPI.listBusinesses(params),
        FeesAPI.listMisc(params),
      ]);
      setDocumentFees(docs || []);
      setBusinessFees(businesses || []);
      setMiscFees(misc || []);
    } catch (err) {
      handleError(err, "Failed to fetch fees");
    } finally {
      setLoading(false);
    }
  }, [barangayId, enabled]);

  // 🚀 Fetch on mount with delay
  useEffect(() => {
    if (!enabled) {
      setDocumentFees([]);
      setBusinessFees([]);
      setMiscFees([]);
      return;
    }
    const timer = setTimeout(() => {
      refreshData();
    }, delayMs);

    return () => clearTimeout(timer);
  }, [refreshData, delayMs, enabled]);

  return {
    documentFees,
    businessFees,
    miscFees,
    loading,
    error,
    refreshData,
    updateDocumentFee: async (id, item, key, value) => {
      try {
        const payload = buildDocumentPayload(item, key, value);
        await FeesAPI.updateDocument(id, payload);
        setDocumentFees(prev =>
          prev.map(d => (d.id === id ? { ...d, ...payload } : d))
        );
      } catch (err) {
        handleError(err, "Failed to update document fee");
      }
    },
    updateBusinessFee: async (id, item, key, value) => {
      try {
        const payload = buildBusinessPayload(item, key, value);
        await FeesAPI.updateBusiness(id, payload);
        setBusinessFees(prev =>
          prev.map(b => (b.id === id ? { ...b, ...payload } : b))
        );
      } catch (err) {
        handleError(err, "Failed to update business fee");
      }
    },
    updateMiscFee: async (id, item, key, value) => {
      try {
        if (!id) {
          throw new Error("No linked miscellaneous fee record was found");
        }
        const payload = item.miscUsage
          ? buildUsageMiscPayload(item, key, value, item.miscUsage)
          : buildMiscPayload(item, key, value);
        await FeesAPI.updateMisc(id, payload);
        setMiscFees(prev =>
          prev.map(m => (m.id === id ? { ...m, ...payload } : m))
        );
      } catch (err) {
        handleError(err, "Failed to update miscellaneous fee");
      }
    },
    deleteDocumentFee: async (id) => {
      try {
        await FeesAPI.deleteDocument(id);
        setDocumentFees(prev => prev.filter(d => d.id !== id));
      } catch (err) {
        handleError(err, "Failed to delete document fee");
      }
    },
    deleteBusinessFee: async (id) => {
      try {
        await FeesAPI.deleteBusiness(id);
        setBusinessFees(prev => prev.filter(b => b.id !== id));
      } catch (err) {
        handleError(err, "Failed to delete business fee");
      }
    },
    deleteMiscFee: async (id) => {
      try {
        await FeesAPI.deleteMisc(id);
        setMiscFees(prev => prev.filter(m => m.id !== id));
      } catch (err) {
        handleError(err, "Failed to delete miscellaneous fee");
      }
    },
  };
}
