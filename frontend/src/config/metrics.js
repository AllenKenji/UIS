export const roleCollections = {
  admin: ["logins", "collections", "businesses", "complaints", "documents", "incidents"],
  secretary: ["documents", "incidents"],
  staff: ["incidents"],
  resident: ["documents"],
};

export const metricConfig = {
  logins: { label: "Logins", variant: "success", icon: "🔑" },
  collections: { label: "Collections", variant: "info", icon: "💰" },
  businesses: { label: "Registered Businesses", variant: "success", icon: "🏢" },
  complaints: { label: "Complaints", variant: "danger", icon: "🗣️" },
  documents: { label: "Certificates Issued", variant: "accent", icon: "📄" },
  incidents: { label: "Incidents Logged", variant: "danger", icon: "⚠️" },
};
