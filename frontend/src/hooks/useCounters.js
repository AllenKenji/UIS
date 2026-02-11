// hooks/useCounters.js
import { useEffect, useState } from "react";
import { api } from "../services/api"; // or use Firestore directly

export const useCounters = () => {
  const [counters, setCounters] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCounters = async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/api/counters");
        setCounters(data);
      } catch (err) {
        console.error("❌ Error fetching counters:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCounters();
  }, []);

  return { counters, loading };
};
