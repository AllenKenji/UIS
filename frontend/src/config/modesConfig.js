const modesConfig = {
  document: {
    endpoint: "/api/fees/documents",
    fields: [
      { name: "documentType", label: "Document Type", type: "text" },
      { name: "fee", label: "Fee", type: "number" },
      { name: "enabled", label: "Enabled", type: "checkbox" },
      { name: "miscType", label: "Misc Fee Type", type: "select" }, // ✅ new
      {
        name: "miscFeeType",
        label: "Misc Calculation",
        type: "select",
        options: [
          { value: "fixed", label: "Fixed amount" },
          { value: "percentage", label: "Percentage" },
        ],
      },
    ],
  },
  business: {
    endpoint: "/api/fees/businesses",
    fields: [
      { name: "businessType", label: "Business Type", type: "text" },
      { name: "fee", label: "Base Fee (₱)", type: "number" },
      { name: "registrationFee", label: "Registration Fee", type: "number" },
      { name: "annualFee", label: "Annual Fee", type: "number" },
      { name: "enabled", label: "Enabled", type: "checkbox" },
      { name: "miscType", label: "Misc Fee Type", type: "select" }, // ✅ new
      {
        name: "miscFeeType",
        label: "Misc Calculation",
        type: "select",
        options: [
          { value: "fixed", label: "Fixed amount" },
          { value: "percentage", label: "Percentage" },
        ],
      },
    ],
  },
  misc: {
    endpoint: "/api/fees/misc",
    fields: [
      { name: "miscType", label: "Misc Type", type: "text" },
      {
        name: "feeType",
        label: "Fee Calculation",
        type: "select",
        options: [
          { value: "fixed", label: "Fixed amount" },
          { value: "percentage", label: "Percentage" },
        ],
      },
      { name: "fee", label: "Fee", type: "number" },
      { name: "enabled", label: "Enabled", type: "checkbox" },
    ],
  },
};

export default modesConfig;
