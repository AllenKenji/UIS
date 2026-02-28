export const roleCollections = {
  admin: ["logins", "documents", "incidents"],
  secretary: ["documents", "incidents"],
  staff: ["incidents"],
  resident: ["documents"],
};

export const metricConfig = {
  logins: { label: "Logins", variant: "success", icon: "🔑" },
  documents: { label: "Certificates Issued", variant: "accent", icon: "📄" },
  incidents: { label: "Incidents Logged", variant: "danger", icon: "⚠️" },
};
