export const roleCollections = {
  admin: ["logins", "documents", "incidents"],
  secretary: ["documents", "incidents"],
  staff: ["incidents"],
  resident: ["documents"],
};

export const metricConfig = {
  logins: { label: "Logins", variant: "info", icon: "🔑" },
  documents: { label: "Certificates Issued", variant: "success", icon: "📄" },
  incidents: { label: "Incidents Logged", variant: "danger", icon: "⚠️" },
};
