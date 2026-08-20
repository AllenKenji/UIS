const modesConfig = {
  document: {
    endpoint: "/api/fees/documents",
    fields: [
      { name: "documentType", label: "Document Type", type: "text" },
      { name: "fee", label: "Fee", type: "number" },
      { name: "enabled", label: "Enabled", type: "checkbox" },
      { name: "miscType", label: "Misc Fee Type", type: "select" }, // ✅ new
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
    ],
  },
  misc: {
    endpoint: "/api/fees/misc",
    fields: [
      { name: "miscType", label: "Misc Type", type: "text" },
      { name: "useForDocuments", label: "Use for Documents", type: "checkbox" },
      { name: "documentFeeType", label: "Document Fee Calculation", type: "select", options: [
        { value: "fixed", label: "Fixed amount" },
        { value: "percentage", label: "Percentage" },
      ] },
      { name: "documentFee", label: "Document Value", type: "number" },
      { name: "useForBusinesses", label: "Use for Businesses", type: "checkbox" },
      { name: "businessFeeType", label: "Business Fee Calculation", type: "select", options: [
        { value: "fixed", label: "Fixed amount" },
        { value: "percentage", label: "Percentage" },
      ] },
      { name: "businessFee", label: "Business Value", type: "number" },
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
