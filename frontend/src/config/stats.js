// 📊 Unified stats + role access config
export const statsConfig = {
  residents: {
    label: "Residents",
    variant: "accent",
    icon: "👥",
    roles: ["admin", "staff"],
  },
  businesses: {
    label: "Businesses",
    variant: "success",
    icon: "💼",
    roles: ["admin", "staff"],
  },
  complaints: {
    label: "Complaints Filed",
    variant: "danger",
    icon: "🗣️",
    roles: ["admin", "staff", "resident"],
  },
  incidents: {
    label: "Incidents Reported",
    variant: "warning",
    icon: "⚠️",
    roles: ["admin", "staff"],
  },
  documents: {
    label: "Documents Issued",
    variant: "info",
    icon: "📄",
    roles: ["admin", "secretary", "resident"],
  },
  logins: {
    label: "Login Records",
    variant: "neutral",
    icon: "📊",
    roles: ["admin", "dilg"],
  },
  youth: {
    label: "Youth Registry",
    variant: "youth",
    icon: "🧒",
    roles: ["admin", "sk"],
  },
  fees: {
    label: "Fees Collected",
    variant: "treasurer",
    icon: "💰",
    roles: ["admin", "treasurer"],
  },
};
