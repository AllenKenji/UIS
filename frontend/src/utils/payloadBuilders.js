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
  feeType: key === "feeType" ? value : item.feeType || "fixed",
  fee: safeNumber(key === "fee" ? value : item.fee),
  enabled: key === "enabled" ? !!value : !!item.enabled,
  miscType: item.miscType || item.id || null, // ✅ always include
});
