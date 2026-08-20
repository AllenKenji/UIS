// src/utils/fees.js
export function calculateMiscFee(misc, baseAmount) {
  if (!misc) return 0;
  return misc.feeType === "percentage"
    ? Math.round((Number(baseAmount) || 0) * (Number(misc.fee) || 0) / 100)
    : Number(misc.fee) || 0;
}

export function resolveMiscFees(items, miscFees, shouldResolve = true, usage = "document") {
  const miscMap = Object.fromEntries(
    miscFees.map(m => [m.miscType.toLowerCase(), m])
  );

  return items.map(item => {
    if (!shouldResolve) return { ...item, miscFeeResolved: null };

    const misc = item.miscType
      ? miscMap[item.miscType.toLowerCase()]
      : null;

    const useFee = usage === "document" ? misc?.useForDocuments : misc?.useForBusinesses;
    const feeType = usage === "document" ? misc?.documentFeeType : misc?.businessFeeType;
    const feeValue = usage === "document" ? misc?.documentFee : misc?.businessFee;
    const configured = usage === "document" ? "useForDocuments" in (misc || {}) : "useForBusinesses" in (misc || {});

    return {
      ...item,
      miscFeeResolved:
        misc && misc.enabled && item.enabled && (!configured || useFee)
          ? calculateMiscFee(configured ? { fee: feeValue, feeType } : misc, item.fee)
          : null,
      miscFeeType: configured ? feeType : misc?.feeType || "fixed",
      miscFeeRate: configured ? feeValue : misc?.fee ?? 0,
    };
  });
}
