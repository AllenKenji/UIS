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

  return { valid: true, message: "" };
}
