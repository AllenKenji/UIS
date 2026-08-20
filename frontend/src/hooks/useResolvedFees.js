import { useFees } from "./useFees";
import { calculateMiscFee, resolveMiscFees } from "../utils/fees";

/**
 * Wraps useFees and resolves misc fees for documents and businesses.
 * Provides registrationTotal and annualTotal for businesses.
 */
export function useResolvedFees() {
  const {
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
  } = useFees();

  const resolvedDocuments = resolveMiscFees(documentFees, miscFees, true);
  const resolvedBusinesses = resolveMiscFees(businessFees, miscFees, true);

  /**
   * Compute totals for a given item.
   * - Document: base fee + misc (if enabled)
   * - Business: registrationTotal and annualTotal
   */
  const getRegistrationTotal = (item) => {
    let total = (item.fee || 0) + (item.registrationFee || 0);
    if (item.enabled && item.miscFeeResolved !== null) {
      total += item.miscFeeType === "percentage"
        ? calculateMiscFee({ fee: item.miscFeeRate, feeType: item.miscFeeType }, total)
        : item.miscFeeResolved;
    }
    return total;
  };

  const getAnnualTotal = (item) => {
    let total = (item.fee || 0) + (item.annualFee || 0);
    if (item.enabled && item.miscFeeResolved !== null) {
      total += item.miscFeeType === "percentage"
        ? calculateMiscFee({ fee: item.miscFeeRate, feeType: item.miscFeeType }, total)
        : item.miscFeeResolved;
    }
    return total;
  };

  const getDocumentTotal = (item) => {
    let total = item.fee || 0;
    if (item.enabled && item.miscFeeResolved) {
      total += item.miscFeeResolved;
    }
    return total;
  };

  return {
    documentFees: resolvedDocuments.map(doc => ({
      ...doc,
      totalFee: getDocumentTotal(doc),
    })),
    businessFees: resolvedBusinesses.map(biz => ({
      ...biz,
      registrationTotal: getRegistrationTotal(biz),
      annualTotal: getAnnualTotal(biz),
    })),
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
    getRegistrationTotal,
    getAnnualTotal,
    getDocumentTotal,
  };
}
