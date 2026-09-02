// src/utils/payloadBuilders.js

// 🔧 Helper to safely coerce numbers
const safeNumber = (val) => {
  if (val === null || val === undefined || val === "") {
    return null; // explicitly missing
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
};


// 📄 Document payload builder
export const buildDocumentPayload = (item, key, value) => ({
  fee: safeNumber(key === "fee" ? value : item.fee),
  miscType: (key === "miscType" ? value : item.miscType) || null,
  miscFeeType: key === "miscFeeType" ? value : item.miscFeeType || null,
  miscFeeRate: safeNumber(key === "miscFeeValue" ? value : item.miscFeeRate),
  enabled: key === "enabled" ? !!value : !!item.enabled,
  validityDays: safeNumber(key === "validityDays" ? value : item.validityDays),
  documentType: item.documentType || item.id || null, // ✅ always include
});

// 🏢 Business payload builder
export const buildBusinessPayload = (item, key, value) => ({
  fee: safeNumber(key === "fee" ? value : item.fee),
  registrationFee: safeNumber(
    key === "registrationFee" ? value : item.registrationFee
  ),
  annualFee: safeNumber(
    key === "annualFee" ? value : item.annualFee
  ),
  miscType: (key === "miscType" ? value : item.miscType) || null,
  miscFeeType: key === "miscFeeType" ? value : item.miscFeeType || null,
  miscFeeRate: safeNumber(key === "miscFeeValue" ? value : item.miscFeeRate),
  enabled: key === "enabled" ? !!value : !!item.enabled,
  businessType: item.businessType || item.id || null, // ✅ always include
});

// 🆕 Misc payload builder
export const buildMiscPayload = (item, key, value) => ({
  targetType: key === "targetType" ? value : item.targetType || null,
  targetName: key === "targetName" ? value : item.targetName || null,
  feeType: item.feeType || "fixed",
  fee: safeNumber(item.fee ?? 0),
  useForDocuments: key === "useForDocuments" ? !!value : !!item.useForDocuments,
  documentFeeType: key === "documentFeeType" ? value : item.documentFeeType || "fixed",
  documentFee: safeNumber(key === "documentFee" ? value : item.documentFee ?? 0),
  useForBusinesses: key === "useForBusinesses" ? !!value : !!item.useForBusinesses,
  businessFeeType: key === "businessFeeType" ? value : item.businessFeeType || "fixed",
  businessFee: safeNumber(key === "businessFee" ? value : item.businessFee ?? 0),
  enabled: key === "enabled" ? !!value : !!item.enabled,
  miscType: item.miscType || item.id || null, // ✅ always include
});

export const buildUsageMiscPayload = (item, key, value, usage) => {
  const isDocument = usage === "document";
  const currentType = item.miscFeeType || "fixed";
  const currentValue = item.miscFeeRate ?? 0;
  const selectedType = key === "miscFeeType" ? value : currentType;
  const selectedValue = key === "miscFeeValue" ? value : currentValue;
  return {
    targetType: item.miscTargetType || usage,
    targetName: item.miscTargetName || (isDocument ? item.documentType : item.businessType),
    feeType: item.feeType || "fixed",
    fee: safeNumber(item.fee ?? 0),
    useForDocuments: isDocument ? true : !!item.useForDocuments,
    documentFeeType: isDocument ? selectedType : item.documentFeeType || currentType,
    documentFee: safeNumber(isDocument ? selectedValue : item.documentFee ?? currentValue),
    useForBusinesses: !isDocument ? true : !!item.useForBusinesses,
    businessFeeType: !isDocument ? selectedType : item.businessFeeType || currentType,
    businessFee: safeNumber(!isDocument ? selectedValue : item.businessFee ?? currentValue),
    enabled: item.enabled !== false,
    miscType: item.miscType,
  };
};
