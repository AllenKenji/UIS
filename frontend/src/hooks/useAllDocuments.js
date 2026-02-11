// src/hooks/useAllDocuments.js
import { useEffect, useState } from "react";
import { api } from "../services/api";

export const useAllDocuments = () => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const res = await api.get("/api/documents"); // ✅ global endpoint
        setDocs(res.data);
      } catch (err) {
        console.error("❌ Error fetching documents:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDocs();
  }, []);

  return { docs, loading };
};
