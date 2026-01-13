// src/config/validationConfig.js

const validationConfig = {
  document: {
    rules: [
      {
        field: "documentType",
        validate: (val) => val && val.trim().length > 0,
        message: "⚠️ Document Type is required",
      },
      {
        field: "fee",
        validate: (val) => typeof val === "number" && val >= 0,
        message: "⚠️ Fee must be a non-negative number",
      },
    ],
  },
  business: {
    rules: [
      {
        field: "businessType",
        validate: (val) => val && val.trim().length > 0,
        message: "⚠️ Business Type is required",
      },
      {
        field: "registrationFee",
        validate: (val) => typeof val === "number" && val >= 0,
        message: "⚠️ Registration Fee must be non-negative",
      },
      {
        field: "annualFee",
        validate: (val) => typeof val === "number" && val >= 0,
        message: "⚠️ Annual Fee must be non-negative",
      },
    ],
  },
  misc: {
    rules: [
      {
        field: "miscType",
        validate: (val) => val && val.trim().length > 0,
        message: "⚠️ Misc Type is required",
      },
      {
        field: "fee",
        validate: (val) => typeof val === "number" && val >= 0,
        message: "⚠️ Misc Fee must be non-negative",
      },
      {
        field: "enabled",
        validate: (val) => typeof val === "boolean",
        message: "⚠️ Enabled must be true or false",
      },
    ],
  },
  // 🆕 Add more modes here in the future
};

export default validationConfig;
