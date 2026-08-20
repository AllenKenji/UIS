// src/utils/validation.js
import validationConfig from "../config/validationConfig";

export function validateFeePayload(mode, payload) {
  const config = validationConfig[mode];
  if (!config) {
    return { valid: false, message: `Unknown mode: ${mode}` };
  }

  for (const rule of config.rules) {
    const value = payload[rule.field];
    if (!rule.validate(value)) {
      return { valid: false, message: rule.message };
    }
  }

  if (mode === "misc" && payload.feeType === "percentage" && payload.fee > 100) {
    return { valid: false, message: "Percentage miscellaneous fees must be between 0 and 100" };
  }

  return { valid: true, message: "" };
}
