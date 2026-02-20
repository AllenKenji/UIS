import { usePayments } from "./usePayments";
import { useDisbursements } from "./useDisbursements";
import jsPDF from "jspdf";

export function useReports() {
  const { transactions, totals } = usePayments();
  const { disbursements } = useDisbursements();

  function generateMonthlyReport() {
    const report = {
      collections: totals.collections,
      pending: totals.pending,
      completed: totals.completed,
      outstanding: totals.outstanding,
      transactions,
      disbursements
    };

    // Create PDF
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Barangay Monthly Report", 20, 20);

    doc.setFontSize(12);
    doc.text(`Collections: ₱${report.collections || 0}`, 20, 40);
    doc.text(`Pending: ₱${report.pending || 0}`, 20, 50);
    doc.text(`Completed: ₱${report.completed || 0}`, 20, 60);
    doc.text(`Outstanding: ₱${report.outstanding || 0}`, 20, 70);

    doc.text("Disbursements:", 20, 90);
    report.disbursements.forEach((d, i) => {
      doc.text(
        `${i + 1}. ${d.category} - ₱${d.amount} (${d.recipient})`,
        25,
        100 + i * 10
      );
    });

    // Save PDF
    doc.save("Monthly_Report.pdf");

    return report;
  }

  return { generateMonthlyReport };
}
