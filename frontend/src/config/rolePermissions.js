const rolePermissions = {
  admin: [
    "viewDashboard",
    "viewCfdpSurvey",
    "createAccount",
    "deleteAccount",
    "updateRole",
    "manageResidents",
    "generateCertificates",
    "viewFinancialRecords",
    "manageFinancialRecords",
    "youthRegistryAccess",
    "auditBarangayData",
    "documentRequest",
    "manageDocuments",
    "issuedDocuments",
    "rejectedRequests",
    "viewDocuments",
    "viewBusinesses",
    "viewAllComplaints",
    "manageComplaints",
    "fileComplaintsForResidents",
    "viewIncidents",
    "manageSettings",
    "manageAnnouncements",
    "manageEvents",
    "viewUsers",
    "manageUsers"
  ],
  surveyor: [
    "viewDashboard",
    "viewCfdpSurvey"
  ],
  supervisor: [
    "viewDashboard",
    "viewCfdpSurvey"
  ],
  staff: [
    "viewDashboard",
    "manageBusinesses",
    "registerResidentBusinesses",
    "manageComplaints",
    "manageResidents",
    "viewBusinesses",
    "viewIncidents",
    "viewAllComplaints",
    "fileComplaintsForResidents"
  ],
  resident: [
    "viewDashboard",
    "fileComplaints",
    "viewOwnComplaints",
    "viewOwnDocuments",
    "requestDocuments",
    "viewOwnBusinesses",
    "registerBusinesses",
    "reportIncidents",
    "viewOwnIncidents",
    "submitFeedback"
  ],
  secretary: [
    "viewDashboard",
    "documentRequest",
    "viewDocuments",
    "pendingRequests",
    "paidRequests",
    "issuedDocuments",
    "rejectedRequests",
    "manageDocuments"
  ],
  treasurer: [
    "viewDashboard",
    "incomingPayments",
    "barangayExpenses",
    "financialReports",
    "settings",
    "manageUsers"
  ],
  sk: [
    "viewDashboard",
    "youthRegistryAccess"
  ],
  dilg: [
    "viewDashboard",
    "auditBarangayData"
  ]
};

export default rolePermissions;
