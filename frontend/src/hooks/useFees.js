// src/hooks/useFees.js
import { useState, useEffect, useCallback } from "react";
import { FeesAPI } from "../services/api"; // ✅ centralized API client
import {
  buildDocumentPayload,
  buildBusinessPayload,
  buildMiscPayload,
} from "../utils/payloadBuilders"; // ✅ centralized payload builders

export function useFees() {
  const [documentFees, setDocumentFees] = useState([]);
  const [businessFees, setBusinessFees] = useState([]);
  const [miscFees, setMiscFees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 🔧 Helper for error handling
  const handleError = (err, fallbackMsg) => {
    console.error(err);
    setError(err?.message || fallbackMsg);
  };

  // 🔄 Fetch all fees
  const refreshData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docs, businesses, misc] = await Promise.all([
        FeesAPI.listDocuments(),
        FeesAPI.listBusinesses(),
        FeesAPI.listMisc(),
      ]);
      setDocumentFees(docs || []);
      setBusinessFees(businesses || []);
      setMiscFees(misc || []);
    } catch (err) {
      handleError(err, "Failed to fetch fees");
    } finally {
      setLoading(false);
    }
  }, []);

  // 📄 Update document fee
  const updateDocumentFee = async (id, item, key, value) => {
    try {
      const payload = buildDocumentPayload(item, key, value);
      await FeesAPI.updateDocument(id, payload);
      setDocumentFees(prev =>
        prev.map(d => (d.id === id ? { ...d, ...payload } : d))
      );
    } catch (err) {
      handleError(err, "Failed to update document fee");
    }
  };

  // 🏢 Update business fee
  const updateBusinessFee = async (id, item, key, value) => {
    try {
      const payload = buildBusinessPayload(item, key, value);
      await FeesAPI.updateBusiness(id, payload);
      setBusinessFees(prev =>
        prev.map(b => (b.id === id ? { ...b, ...payload } : b))
      );
    } catch (err) {
      handleError(err, "Failed to update business fee");
    }
  };

  // 🆕 Update misc fee
  const updateMiscFee = async (id, item, key, value) => {
    try {
      const payload = buildMiscPayload(item, key, value);
      await FeesAPI.updateMisc(id, payload);
      setMiscFees(prev =>
        prev.map(m => (m.id === id ? { ...m, ...payload } : m))
      );
    } catch (err) {
      handleError(err, "Failed to update miscellaneous fee");
    }
  };

  // 📄 Delete document fee
  const deleteDocumentFee = async (id) => {
    try {
      await FeesAPI.deleteDocument(id);
      setDocumentFees(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      handleError(err, "Failed to delete document fee");
    }
  };

  // 🏢 Delete business fee
  const deleteBusinessFee = async (id) => {
    try {
      await FeesAPI.deleteBusiness(id);
      setBusinessFees(prev => prev.filter(b => b.id !== id));
    } catch (err) {
      handleError(err, "Failed to delete business fee");
    }
  };

  // 🆕 Delete misc fee
  const deleteMiscFee = async (id) => {
    try {
      await FeesAPI.deleteMisc(id);
      setMiscFees(prev => prev.filter(m => m.id !== id));
    } catch (err) {
      handleError(err, "Failed to delete miscellaneous fee");
    }
  };

  // 🚀 Fetch on mount
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  return {
    documentFees,
    businessFees,
    miscFees,
    loading,
    error,
    refreshData,
    updateDocumentFee,
    updateBusinessFee,
    updateMiscFee,
    deleteDocumentFee,
    deleteBusinessFee,
    deleteMiscFee,
  };
}
