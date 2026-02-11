// 🔧 Common link definitions
const links = {
  dashboard: (path) => ({ path, label: "🏠 Dashboard", action: "viewDashboard" }),
  residents: { path: "/residents", label: "👥 Residents", action: "manageResidents" },
  addResident: { path: "/residents/new", label: "➕ Add Resident", action: "manageResidents" },
  businesses: { path: "/businesses", label: "💼 Businesses", action: "viewBusinesses" },
  ownBusinesses: { path: "/businesses/my", label: "💼 My Businesses", action: "viewOwnBusinesses" },
  registerBusiness: { path: "/businesses/new", label: "➕ Register Business", action: "registerBusinesses" },
  registerResidentBusiness: { path: "/residentBusinesses", label: "➕ Register Resident Businesses", action: "registerResidentBusinesses" },
  documents: { path: "/documents", label: "📄 Documents", action: "viewDocuments" },
  ownDocuments: { path: "/ownDocuments", label: "📄 My Documents", action: "viewOwnDocuments" },
  
  requestDocument: { path: "/documents/request", label: "📝 Request Document", action: "requestDocuments" },
  incidents: { path: "/incidents", label: "⚠️ Incidents", action: "viewIncidents" },
  reportIncident: { path: "/incidents/new", label: "⚠️ Report Incident", action: "reportIncidents" },
  myIncidents: { path: "/myIncidents", label: "⚠️ My Incidents", action: "viewOwnIncidents" },
  fileComplaint: { path: "/complaints/new", label: "🗣️ File Complaint", action: "fileComplaints" },
  evaluateComplaints: { path: "/complaints/evaluate", label: "🗣️ Evaluate Complaints", action: "manageComplaints" },
  viewOwnComplaints: { path: "/myComplaints", label: "🗣️ My Complaints", action: "viewOwnComplaints" },
  viewAllComplaints: { path: "/allComplaints", label: "🗣️ View All Complaints", action: "viewAllComplaints" },
  createAccount: { path: "/accounts/new", label: "➕ Create Account", action: "createAccounts" },
  finance: { path: "/finance", label: "💰 Finance", action: "viewFinancialRecords" },
  audit: { path: "/audit", label: "📊 Audit", action: "auditBarangayData" },
  youth: { path: "/youth", label: "🏠 Dashboard", action: "viewDashboard" },
  home: { path: "/", label: "🏠 Home", action: "viewDashboard" },

  // Secretary-specific links
  requestForDocuments: { path: "/secretary/documents", label: "📝 Document Request", action: "documentRequest" },
  pendingRequests: { path: "/secretary/pending", label: "📋 Pending Requests", action: "pendingRequests" },
  paidRequests: { path: "/secretary/payments", label: "💳 Paid Requests", action: "paidRequests" },
  issuedDocuments: { path: "/secretary/issued", label: "✅ Issued Documents", action: "issuedDocuments" },
  rejectedRequests: { path: "/secretary/rejected", label: "❌ Rejected Requests", action: "rejectedRequests" },
};

const sidebarLinks = {
  admin: [
    links.dashboard("/admin"),
    links.residents,
    links.businesses,
    links.documents,
    links.incidents,
    links.viewAllComplaints,   // 👀 Admin oversight
    links.fileComplaint,
    links.createAccount,
    links.finance,
    links.audit,
  ],
  staff: [
    links.dashboard("/staff"),
    links.residents,
    links.addResident,
    links.businesses,
    links.registerResidentBusiness,
    links.incidents,
    links.viewAllComplaints,
    links.fileComplaint,
  ],
  secretary: [
    links.dashboard("/secretary"),
    links.requestForDocuments,
    links.pendingRequests,
    links.paidRequests,
    links.issuedDocuments,
    links.documents,
    links.rejectedRequests,
  ],
  treasurer: [
    links.dashboard("/finance"),
    links.documents,
  ],
  sk: [
    links.youth,
  ],
  dilg: [
    links.audit,
  ],
  resident: [
    links.dashboard("/resident"),
    links.fileComplaint,     // ✍️ Resident filing
    links.viewOwnComplaints,   // 👀 Resident tracking
    links.ownDocuments,
    links.requestDocument,
    links.registerBusiness,
    links.ownBusinesses,
    links.reportIncident,
    links.myIncidents,
  ],
  default: [
    links.home,
  ],
};

export default sidebarLinks;
