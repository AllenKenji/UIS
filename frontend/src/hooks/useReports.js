import { usePayments } from "./usePayments";
import { useDisbursements } from "./useDisbursements";
import jsPDF from "jspdf";

export function useReports() {
  const { transactions } = usePayments();
  const { disbursements } = useDisbursements();

  const normalizeDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === "function") return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const normalizeStatus = (value) => String(value || "").trim().toLowerCase();

  const resolveTransactionDate = (tx) => {
    const candidates = [
      tx.datePaid,
      tx.paidAt,
      tx.paymentDate,
      tx.createdAt,
      tx.date,
      tx.updatedAt,
    ];
    for (const candidate of candidates) {
      const parsed = normalizeDate(candidate);
      if (parsed) return parsed;
    }
    return null;
  };

  const resolveDisbursementDate = (disbursement) => {
    const candidates = [
      disbursement.date,
      disbursement.createdAt,
      disbursement.updatedAt,
    ];
    for (const candidate of candidates) {
      const parsed = normalizeDate(candidate);
      if (parsed) return parsed;
    }
    return null;
  };

  const resolveMonthWindow = (monthValue) => {
    const matched = /^\d{4}-\d{2}$/.test(String(monthValue || ""));
    const source = matched ? String(monthValue) : new Date().toISOString().slice(0, 7);
    const [yearStr, monthStr] = source.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 1);
    const monthLabel = start.toLocaleString("default", { month: "long", year: "numeric" });
    return { source, start, end, monthLabel };
  };

  const resolveYearWindow = (yearValue) => {
    const currentYear = new Date().getFullYear();
    const year = Number(yearValue);
    const safeYear = Number.isInteger(year) && year >= 2000 && year <= 9999 ? year : currentYear;
    const start = new Date(safeYear, 0, 1);
    const end = new Date(safeYear + 1, 0, 1);
    return { source: String(safeYear), start, end, yearLabel: String(safeYear) };
  };

  const buildReportForWindow = ({
    start,
    end,
    periodLabel,
    periodType,
    source,
    fileNamePrefix,
    emptyTransactionsText,
    emptyDisbursementsText,
  }) => {
    const safePdfText = (value) => String(value ?? "").replace(/[^\x20-\x7E]/g, "");
    const formatCurrency = (amount) => `PHP ${(Number(amount) || 0).toLocaleString()}`;

    const scopedTransactions = transactions.filter((tx) => {
      const txDate = resolveTransactionDate(tx);
      return txDate && txDate >= start && txDate < end;
    });

    const scopedDisbursements = disbursements.filter((entry) => {
      const disbDate = resolveDisbursementDate(entry);
      return disbDate && disbDate >= start && disbDate < end;
    });

    const paidTransactions = scopedTransactions.filter((tx) => {
      const status = normalizeStatus(tx.paymentStatus || tx.status);
      return status === "paid" || status === "approved";
    });

    const pendingTransactions = scopedTransactions.filter((tx) => {
      const status = normalizeStatus(tx.paymentStatus || tx.status);
      return ["pending", "for_payment", "awaiting_payment", "unpaid", "payment_submitted"].includes(status);
    });

    const approvedDisbursements = scopedDisbursements.filter(
      (d) => normalizeStatus(d.status) === "approved"
    );
    const pendingDisbursements = scopedDisbursements.filter(
      (d) => normalizeStatus(d.status) === "pending"
    );

    const report = {
      period: periodLabel,
      periodType,
      periodValue: source,
      month: periodType === "monthly" ? periodLabel : undefined,
      year: periodType === "yearly" ? periodLabel : undefined,
      collections: paidTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0),
      pendingCount: pendingTransactions.length,
      completedCount: paidTransactions.length,
      outstandingAmount: pendingTransactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0),
      transactions: scopedTransactions,
      disbursements: scopedDisbursements,
      approvedDisbursementsAmount: approvedDisbursements.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
      pendingDisbursementsAmount: pendingDisbursements.reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
    };

    const titleType = periodType === "yearly" ? "Yearly" : "Monthly";

    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text(safePdfText(`Barangay ${titleType} Report - ${report.period}`), 20, 20);

    doc.setFontSize(12);
    doc.text(safePdfText(`Collections: ${formatCurrency(report.collections)}`), 20, 40);
    doc.text(safePdfText(`Pending Payments: ${report.pendingCount || 0}`), 20, 50);
    doc.text(safePdfText(`Completed Payments: ${report.completedCount || 0}`), 20, 60);
    doc.text(safePdfText(`Outstanding: ${formatCurrency(report.outstandingAmount)}`), 20, 70);
    doc.text(safePdfText(`Approved Disbursements: ${formatCurrency(report.approvedDisbursementsAmount)}`), 20, 80);
    doc.text(safePdfText(`Pending Disbursements: ${formatCurrency(report.pendingDisbursementsAmount)}`), 20, 90);

    let y = 110;
    doc.setFontSize(11);
    doc.text("Transactions:", 20, y);
    y += 8;

    if (report.transactions.length === 0) {
      doc.text(safePdfText(emptyTransactionsText), 25, y);
      y += 10;
    } else {
      report.transactions.forEach((tx, i) => {
        const status = tx.paymentStatus || tx.status || "-";
        const txDate = resolveTransactionDate(tx);
        const dateLabel = txDate ? txDate.toLocaleDateString() : "-";
        const name = tx.businessName || tx.ownerName || tx.residentName || "N/A";
        const line = `${i + 1}. ${name} | ${status} | ${formatCurrency(tx.amount)} | ${dateLabel}`;

        if (y > 280) {
          doc.addPage();
          y = 20;
        }

        doc.text(safePdfText(line), 25, y);
        y += 8;
      });
    }

    if (y > 260) {
      doc.addPage();
      y = 20;
    }
    doc.text("Disbursements:", 20, y);
    y += 8;

    if (report.disbursements.length === 0) {
      doc.text(safePdfText(emptyDisbursementsText), 25, y);
    } else {
      report.disbursements.forEach((d, i) => {
        const line = `${i + 1}. ${d.category || "Misc"} - ${formatCurrency(d.amount)} (${d.recipient || "N/A"})`;
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        doc.text(safePdfText(line), 25, y);
        y += 8;
      });
    }

    doc.save(`${fileNamePrefix}_${source}.pdf`);

    return report;
  };

  function generateMonthlyReport(monthValue) {
    const { source, start, end, monthLabel } = resolveMonthWindow(monthValue);

    return buildReportForWindow({
      start,
      end,
      periodLabel: monthLabel,
      periodType: "monthly",
      source,
      fileNamePrefix: "Monthly_Report",
      emptyTransactionsText: "No transactions for this month.",
      emptyDisbursementsText: "No disbursements for this month.",
    });
  }

  function generateYearlyReport(yearValue) {
    const { source, start, end, yearLabel } = resolveYearWindow(yearValue);

    return buildReportForWindow({
      start,
      end,
      periodLabel: yearLabel,
      periodType: "yearly",
      source,
      fileNamePrefix: "Yearly_Report",
      emptyTransactionsText: "No transactions for this year.",
      emptyDisbursementsText: "No disbursements for this year.",
    });
  }

  return { generateMonthlyReport, generateYearlyReport };
}
