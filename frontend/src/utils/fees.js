// src/utils/fees.js
export function calculateMiscFee(misc, baseAmount) {
  if (!misc) return 0;
  return misc.feeType === "percentage"
    ? Math.round((Number(baseAmount) || 0) * (Number(misc.fee) || 0) / 100)
    : Number(misc.fee) || 0;
}

const normalizeFeeKey = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

export function resolveMiscFees(items, miscFees, shouldResolve = true, usage = "document") {
  const miscMap = miscFees.reduce((map, misc) => {
    const key = normalizeFeeKey(misc.miscType || misc.id);
    map[key] = [...(map[key] || []), misc];
    return map;
  }, {});

  return items.map(item => {
    if (!shouldResolve) return { ...item, miscFeeResolved: null };

    const candidates = item.miscType
      ? miscMap[normalizeFeeKey(item.miscType)] || []
      : miscFees.filter(entry => entry.id === item.miscFeeId);
    const targetType = usage === "document" ? "document" : "business";
    const targetName = usage === "document" ? item.documentType : item.businessType;
    const normalizedTarget = normalizeFeeKey(targetName);
    const misc = candidates.find(entry =>
      entry.targetType === targetType && normalizeFeeKey(entry.targetName) === normalizedTarget
    ) || candidates.find(entry => !entry.targetType) || candidates[0] || null;

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
