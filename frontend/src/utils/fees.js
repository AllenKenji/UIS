// src/utils/fees.js
export function calculateMiscFee(misc, baseAmount) {
  if (!misc) return 0;
  return misc.feeType === "percentage"
    ? Math.round((Number(baseAmount) || 0) * (Number(misc.fee) || 0) / 100)
    : Number(misc.fee) || 0;
}

export function resolveMiscFees(items, miscFees, shouldResolve = true, usage = "document") {
  const miscMap = miscFees.reduce((map, misc) => {
    const key = misc.miscType.toLowerCase();
    map[key] = [...(map[key] || []), misc];
    return map;
  }, {});

  return items.map(item => {
    if (!shouldResolve) return { ...item, miscFeeResolved: null };

    const candidates = item.miscType ? miscMap[item.miscType.toLowerCase()] || [] : [];
    const targetType = usage === "document" ? "document" : "business";
    const targetName = usage === "document" ? item.documentType : item.businessType;
    const misc = candidates.find(entry =>
      entry.targetType === targetType && entry.targetName?.toLowerCase() === targetName?.toLowerCase()
    ) || candidates.find(entry => !entry.targetType);

    const useFee = usage === "document" ? misc?.useForDocuments : misc?.useForBusinesses;
    const feeType = usage === "document" ? misc?.documentFeeType : misc?.businessFeeType;
    const feeValue = usage === "document" ? misc?.documentFee : misc?.businessFee;
    const configured = usage === "document" ? "useForDocuments" in (misc || {}) : "useForBusinesses" in (misc || {});

    return {
      ...item,
      miscFeeId: misc?.id || item.miscFeeId,
      miscTargetType: misc?.targetType || item.miscTargetType,
      miscTargetName: misc?.targetName || item.miscTargetName,
      miscFeeResolved:
        misc && misc.enabled && item.enabled && (!configured || useFee)
          ? calculateMiscFee(configured ? { fee: feeValue, feeType } : misc, item.fee)
          : null,
      miscFeeType: configured ? feeType : misc?.feeType || "fixed",
      miscFeeRate: configured ? feeValue : misc?.fee ?? 0,
    };
  });
}
