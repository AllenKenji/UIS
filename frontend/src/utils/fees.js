// src/utils/fees.js
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
        misc && misc.enabled && item.enabled ? misc.fee : null,
    };
  });
}
