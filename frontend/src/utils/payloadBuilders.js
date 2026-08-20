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
  miscType: item.miscType || null,
  enabled: key === "enabled" ? !!value : !!item.enabled,
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
  miscType: item.miscType || null,
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
  return {
    targetType: item.miscTargetType || usage,
    targetName: item.miscTargetName || (isDocument ? item.documentType : item.businessType),
    feeType: item.feeType || "fixed",
    fee: safeNumber(item.fee ?? 0),
    useForDocuments: isDocument ? true : !!item.useForDocuments,
    documentFeeType: isDocument && key === "miscFeeType" ? value : item.documentFeeType || "fixed",
    documentFee: safeNumber(isDocument && key === "miscFeeValue" ? value : item.documentFee ?? item.miscFeeRate ?? 0),
    useForBusinesses: !isDocument ? true : !!item.useForBusinesses,
    businessFeeType: !isDocument && key === "miscFeeType" ? value : item.businessFeeType || "fixed",
    businessFee: safeNumber(!isDocument && key === "miscFeeValue" ? value : item.businessFee ?? item.miscFeeRate ?? 0),
    enabled: item.enabled !== false,
    miscType: item.miscType,
  };
};
