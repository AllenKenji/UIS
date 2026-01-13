// src/hooks/useResolvedFees.js
import { useFees } from "./useFees";
import { resolveMiscFees } from "../utils/fees";

/**
 * Wraps useFees and resolves misc fees for documents,
 * while leaving businesses unresolved (miscFeeResolved = null).
 * Also provides a getTotalFee() helper.
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

  // ✅ Resolve misc fees only for documents
  const resolvedDocuments = resolveMiscFees(documentFees, miscFees, true);

  // ❌ Leave businesses unresolved (miscFeeResolved = null)
  const resolvedBusinesses = resolveMiscFees(businessFees, miscFees, true);

  /**
   * Compute total fee for a given item.
   * - Always includes base fee
   * - Includes miscFeeResolved only if both item.enabled and miscFeeResolved are truthy
   */
  const getTotalFee = (item, type = "document") => {
    let total = item.fee || 0;

    if (type === "business") {
      total += (item.registrationFee || 0) + (item.annualFee || 0);
    }

    // Only include misc fee if both toggles are on
    if (item.enabled && item.miscFeeResolved) {
      total += item.miscFeeResolved;
    }

    return total;
  };

  return {
    documentFees: resolvedDocuments,
    businessFees: resolvedBusinesses,
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
    getTotalFee, // ✅ expose helper
  };
}
