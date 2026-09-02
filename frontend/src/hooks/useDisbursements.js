import { useEffect, useState, useCallback } from "react";
import { DisbursementsAPI } from "../services/api";


export function useDisbursements() {
  const [disbursements, setDisbursements] = useState([]);
  const [totals, setTotals] = useState({});
  const [byCategory, setByCategory] = useState({});
  const [dailySummary, setDailySummary] = useState({});

  // 🔄 Shared calculation logic
  const recalc = useCallback((data) => {
    setDisbursements(data);
    setTotals(calculateTotals(data));
    setByCategory(calculateByCategory(data));
    setDailySummary(calculateDailySummary(data));
  }, []);

  // Manual refresh (e.g. after API mutation)
  const refresh = useCallback(async () => {
    try {
      const data = await DisbursementsAPI.list();
      recalc(Array.isArray(data) ? data : data?.items || []);
    } catch (err) {
      console.error("Failed to refresh disbursements", err);
    }
  }, [recalc]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { disbursements, totals, byCategory, dailySummary, refresh };
}

/* ----------------- Helper Functions ----------------- */

function calculateTotals(disbursements) {
  const spentApproved = disbursements
    .filter(d => d.status === "approved")
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const spentPending = disbursements
    .filter(d => d.status === "pending")
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const countApproved = disbursements.filter(d => d.status === "approved").length;
  const countPending = disbursements.filter(d => d.status === "pending").length;

  return {
    spentApproved,
    spentPending,
    countApproved,
    countPending,
    totalCount: disbursements.length,
  };
}

function calculateByCategory(disbursements) {
  return disbursements.reduce((acc, d) => {
    const category = d.category || "Miscellaneous";
    acc[category] = (acc[category] || 0) + (d.amount || 0);
    return acc;
  }, {});
}

function calculateDailySummary(disbursements) {
  return disbursements.reduce((acc, d) => {
    const date = normalizeDate(d.date);
    if (date) {
      const dateKey = date.toLocaleDateString();
      acc[dateKey] = (acc[dateKey] || 0) + (d.amount || 0);
    }
    return acc;
  }, {});
}

function normalizeDate(dateValue) {
  if (!dateValue) return null;
  if (dateValue instanceof Date) return dateValue;
  if (typeof dateValue?.toDate === "function") return dateValue.toDate();
  const parsed = new Date(dateValue);
  return isNaN(parsed) ? null : parsed;
}
