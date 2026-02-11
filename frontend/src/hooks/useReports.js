import { usePayments } from "./usePayments";
import { useDisbursements } from "./useDisbursements";

export function useReports() {
  const { transactions, totals } = usePayments();
  const { disbursements } = useDisbursements();

  function generateMonthlyReport() {
    const report = {
      collections: totals.collections,
      pending: totals.pending,
      completed: totals.completed,
      outstanding: totals.outstanding,
      transactions,     // now used
      disbursements
    };

    console.log("Monthly Report:", report);
  }

  return { generateMonthlyReport };
}

