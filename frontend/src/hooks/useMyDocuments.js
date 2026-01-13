import { useEffect, useState, useCallback } from "react";
import { api } from "../services/api";

export const useMyDocuments = (residentId) => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDocs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/api/documents/my`, { params: { resident_id: residentId } });
      setDocs(res.data);
    } catch (err) {
      console.error("❌ Error fetching documents:", err.response?.data?.detail || err.message);
    } finally {
      setLoading(false);
    }
  }, [residentId]); // ✅ stable dependency

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]); // ✅ no ESLint warning now

  return { docs, loading, fetchDocs };
};
