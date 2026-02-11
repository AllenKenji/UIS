import roleOverrides from "./role_permissions.json"; // shared JSON

// 🔑 Valid roles (shared across frontend + Firestore)
export const VALID_ROLES = Object.freeze(Object.keys(roleOverrides));

// 📊 Unified stats config (keys must match Firestore collection names)
export const ALL_STATS = Object.freeze({
  residents:  { label: "Residents",           variant: "accent",    icon: "👥" },
  businesses: { label: "Businesses",          variant: "success",   icon: "💼" },
  complaints: { label: "Complaints",          variant: "danger",    icon: "🗣️" },
  incidents:  { label: "Incidents",           variant: "warning",   icon: "⚠️" },
  documents:  { label: "Documents",           variant: "info",      icon: "📄" },
  logins:     { label: "Login Records",       variant: "neutral",   icon: "📊" },
  youth:      { label: "Youth Registry",      variant: "youth",     icon: "🧒" },
  fees:       { label: "Fees",                variant: "info", icon: "💰" },
});

// 🛠️ Derived maps
export const CATEGORIES = Object.freeze(
  Object.fromEntries(Object.entries(ALL_STATS).map(([key, { label }]) => [key, label]))
);

export const CATEGORY_VARIANTS = Object.freeze(
  Object.fromEntries(Object.entries(ALL_STATS).map(([_, { label, variant }]) => [label, variant]))
);

// 🎭 Role options for dropdowns
export const ROLE_OPTIONS = Object.freeze(
  VALID_ROLES.map((role) => ({
    value: role,
    label: role.charAt(0).toUpperCase() + role.slice(1),
  }))
);

// 🚦 Base permissions template (all possible actions)
export const BASE_PERMISSIONS = Object.freeze({
  viewDashboard: true,
  manageResidents: false,
  fileComplaints: false,
  fileComplaintsForResidents: false,
  viewOwnComplaints: false,
  viewAllComplaints: false,
  manageComplaints: false,
  generateCertificates: false,
  viewFinancialRecords: false,
  manageFinancialRecords: false,
  incomingPayments: false,
  barangayExpenses: false,
  financialReports: false,
  youthRegistryAccess: false,
  auditBarangayData: false,
  manageSettings: false,
  settings: false,
  viewDocuments: false,
  viewOwnDocuments: false,
  documentRequest: false,
  requestDocuments: false,
  manageDocuments: false,
  issuedDocuments: false,
  pendingRequests: false,
  paidRequests: false,
  rejectedRequests: false,
  viewBusinesses: false,
  viewOwnBusinesses: false,
  registerBusinesses: false,
  registerResidentBusinesses: false,
  manageBusinesses: false,
  viewIncidents: false,
  viewOwnIncidents: false,
  reportIncidents: false,
  manageIncidents: false,
  manageAnnouncements: false,
  manageEvents: false,
  createAccounts: false,
  viewUsers: false,
  manageUsers: false,
  viewStatus: false,
  submitFeedback: false,
});

// 🧠 Utility to apply overrides
const applyOverrides = (keys = []) =>
  Object.fromEntries(keys.map((perm) => [perm, true]));

// 🚦 Final role-permission map (built from shared JSON)
export const ROLE_PERMISSIONS = Object.freeze(
  Object.fromEntries(
    VALID_ROLES.map((role) => [role, applyOverrides(roleOverrides[role])])
  )
);

// 🔐 Collection → permission mapping
// Each collection can map to one or more permissions
export const COLLECTION_PERMISSIONS = Object.freeze({
  residents:  ["manageResidents"],
  businesses: ["viewBusinesses"],
  complaints: ["viewAllComplaints", "fileComplaints", "viewOwnComplaints", "manageComplaints"], // ✅ dual mapping
  incidents:  ["viewIncidents", "reportIncidents"], 
  documents:  ["viewDocuments", "viewOwnDocuments", "requestDocuments"],
  logins:     ["auditBarangayData"], // consider adding "viewUsers" if admins should see logins
  youth:      ["youthRegistryAccess"],
  fees:       ["viewFinancialRecords"],
});

// 🔄 Auto-derived ROLE_COLLECTIONS (handles arrays of permissions)
export const ROLE_COLLECTIONS = Object.freeze(
  Object.fromEntries(
    VALID_ROLES.map((role) => [
      role,
      Object.entries(COLLECTION_PERMISSIONS)
        .filter(([_, perms]) =>
          perms.some((perm) => ROLE_PERMISSIONS[role][perm])
        )
        .map(([collection]) => collection),
    ])
  )
);
