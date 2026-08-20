// src/utils/fees.js
export function calculateMiscFee(misc, baseAmount) {
  if (!misc) return 0;
  return misc.feeType === "percentage"
    ? Math.round((Number(baseAmount) || 0) * (Number(misc.fee) || 0) / 100)
    : Number(misc.fee) || 0;
}

export function resolveMiscFees(items, miscFees, shouldResolve = true) {
  const miscMap = Object.fromEntries(
    miscFees.map(m => [m.miscType.toLowerCase(), m])
  );

  return items.map(item => {
    if (!shouldResolve) return { ...item, miscFeeResolved: null };

    const misc = item.miscType
      ? miscMap[item.miscType.toLowerCase()]
      : null;

    return {
      ...item,
      miscFeeResolved:
        misc && misc.enabled && item.enabled
          ? calculateMiscFee(misc, item.fee)
          : null,
      miscFeeType: misc?.feeType || "fixed",
      miscFeeRate: misc?.fee ?? 0,
    };
  });
}
