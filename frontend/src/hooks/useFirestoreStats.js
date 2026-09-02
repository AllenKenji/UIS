import { useEffect, useState } from "react";
import { ReportingAPI } from "../services/api";

/**
 * Subscribe to a Firestore collection and return aggregated stats by status
 * @param {string} collectionName - Firestore collection name
 * @param {string} statusField - Field name in documents that represents status
 * @param {Array<string>} statuses - List of statuses to track
 */
export const useFirestoreStats = (
  collectionName,
  statusField = "status",
  statuses = []
) => {
  const [stats, setStats] = useState({ total: 0 });
  const statusesKey = statuses.join("|");

  useEffect(() => {
    let isCurrent = true;
    const requestedStatuses = statusesKey ? statusesKey.split("|") : [];

    if (collectionName !== "documents" || statusField !== "status") {
      setStats({ total: 0 });
      return undefined;
    }

    const loadStats = async () => {
      try {
        const result = await ReportingAPI.documentStatuses();
        const counts = { total: result.total || 0 };
        requestedStatuses.forEach((status) => {
          counts[status] = result.counts?.[status] || 0;
        });
        if (isCurrent) setStats(counts);
      } catch (error) {
        console.error("Unable to load document status totals:", error);
      }
    };

    loadStats();
    const intervalId = window.setInterval(loadStats, 30000);

    return () => {
      isCurrent = false;
      window.clearInterval(intervalId);
    };
  }, [collectionName, statusField, statusesKey]);

  return stats;
};
