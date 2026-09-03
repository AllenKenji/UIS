import axios from "axios";

const isDevelopment = !import.meta.env.PROD;
const rawEnvApiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

const normalizeDevBaseUrl = (url) => {
  if (!url) return "";
  return url.replace("http://localhost:", "http://127.0.0.1:");
};

// 🌐 API base URL strategy:
// - If env var exists, use it (normalized in dev)
// - In development without env var, use local backend
// - In production without env var, use deployed API
export const API_BASE_URL =
  (isDevelopment ? normalizeDevBaseUrl(rawEnvApiBaseUrl) : rawEnvApiBaseUrl) ||
  (isDevelopment ? "http://127.0.0.1:8000" : "https://bis-backend-eg5y.onrender.com");

console.log("🌐 API Base URL:", API_BASE_URL);

  if (import.meta.env.PROD && API_BASE_URL.startsWith("http://")) {
    throw new Error("❌ Production API_BASE_URL must use HTTPS"); 
  }

// 📦 Centralized endpoint registry
export const endpoints = {
  residents: "/api/residents",
  incidents: "/api/incidents",
  complaints: {
    base: "/api/complaints",
    mine: "/api/complaints/mine",
    all: "/api/complaints/all",
    delete: (id) => `/api/complaints/${id}`,
  },
  documents: "/api/documents",
  businesses: "/api/businesses",
  youth: {
    programs: "/api/youth/programs",
    events: "/api/youth/events",
    feedback: "/api/youth/feedback",
  },
  audit: "/api/document_audit",
  reporting: {
    counters: "/api/reporting/counters",
    documentStatuses: "/api/reporting/documents/statuses",
    treasurer: {
      payments: "/api/reporting/treasurer/payments",
      receipts: "/api/reporting/treasurer/receipts",
      businesses: "/api/reporting/treasurer/businesses",
      documents: "/api/reporting/treasurer/documents",
    },
  },
  dashboard: "/api/dashboard-summary",
  disbursements: "/api/disbursements",
  accounts: {
    create: "/api/admin/create-account",
    updateRole: (uid) => `/api/admin/update-role/${uid}`,
    updateProfile: (uid) => `/api/admin/accounts/${uid}/profile`,
    updatePhoto: (uid) => `/api/admin/accounts/${uid}/photo`,
    delete: (uid) => `/api/admin/delete-account/${uid}`,
    list: "/api/admin/accounts",
    mySignature: "/api/account/my-signature",
  },
  settings: {
    permissions: "/api/settings/permissions",
  },
  fees: {
    documents: "/api/fees/documents",
    businesses: "/api/fees/businesses",
    misc: "/api/fees/misc",
  },
  password: { 
    request: "/api/password/request", 
    verify: (token) => `/api/password/verify/${token}`, 
    apply: "/api/password/apply", },
  messages: "/api/messages",
  public: {
    registrations: "/api/public/registrations",
    resolve: "/api/public/access/resolve",
    requestUpdate: "/api/public/access/request-update",
    complaints: "/api/public/complaints",
    announcements: "/api/public/announcements",
    tenants: "/api/public/tenants",
    tenant: (id) => `/api/public/tenants/${id}`,
    verifyBusiness: (businessId) => `/api/public/verify/business/${businessId}`,
    verifyReceipt: (receiptNumber) => `/api/public/verify/receipt/${receiptNumber}`,
  },
  auth: { switchRole: "/api/auth/switch-role" },
  superAdmin: {
    tenants: "/api/super-admin/tenants",
    tenant: (id) => `/api/super-admin/tenants/${id}`,
    tenantLogo: (id) => `/api/super-admin/tenants/${id}/logo`,
    cities: "/api/super-admin/cities",
    city: (id) => `/api/super-admin/cities/${id}`,
    cityLogo: (id) => `/api/super-admin/cities/${id}/logo`,
    provinces: "/api/super-admin/provinces",
    province: (id) => `/api/super-admin/provinces/${id}`,
    accounts: "/api/super-admin/accounts",
    payments: "/api/super-admin/payments",
    payment: (id) => `/api/super-admin/payments/${id}`,
    paymentsSummary: "/api/super-admin/payments/summary",
    receipts: "/api/super-admin/receipts",
    receipt: (id) => `/api/super-admin/receipts/${id}`,
  },
};

// 🛡️ Axios instance
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// Inject the PostgreSQL JWT saved by the local login flow.
api.interceptors.request.use(async (config) => {
  const cachedToken = sessionStorage.getItem("authToken");

  if (config.url?.includes("/api/password/")) { return config; }

  if (cachedToken) {
    config.headers.Authorization = `Bearer ${cachedToken}`;
  }

  return config;
});


// ⚠️ Unified error handler
class APIError extends Error {
  constructor(message, status, context) {
    super(message);
    this.name = "APIError";
    this.status = status;
    this.context = context;
  }
}

const extractErrorDetail = (data) => {
  if (!data) return "Unknown error";
  if (Array.isArray(data)) {
    return data.map(d => `${d.loc?.join(".")}: ${d.msg}`).join("; ");
  }
  if (typeof data === "object") {
    if (Array.isArray(data.detail)) {
      return data.detail.map(d => `${d.loc?.join(".")}: ${d.msg}`).join("; ");
    }
    return data.detail || data.message || data.error || JSON.stringify(data);
  }
  if (typeof data === "string") return data;
  return "Unexpected error format";
};

const handleError = (error, context) => {
  const status = error.response?.status;
  const detail = extractErrorDetail(error.response?.data) || error.message;
  if (!import.meta.env.PROD) {
    console.error(`❌ ${context} failed [${status ?? "no status"}]:`, detail);
  }
  throw new APIError(detail, status, context);
};

// 🔄 Base API class
class BaseAPI {
  constructor(endpoint) {
    this.endpoint = endpoint;
  }

  list(params = {}) {
    return api.get(this.endpoint, { params })
      .then((res) => res.data)
      .catch((err) => handleError(err, `GET ${this.endpoint}`));
  }

  getById(id) {
    return api.get(`${this.endpoint}/${id}`)
      .then((res) => res.data)
      .catch((err) => handleError(err, `GET ${this.endpoint}/${id}`));
  }

  create(data) {
    return api.post(this.endpoint, data)
      .then((res) => res.data)
      .catch((err) => handleError(err, `POST ${this.endpoint}`));
  }

  update(id, data) {
    return api.put(`${this.endpoint}/${id}`, data)
      .then((res) => res.data)
      .catch((err) => handleError(err, `PUT ${this.endpoint}/${id}`));
  }

  patch(id, data) {
    return api.patch(`${this.endpoint}/${id}`, data)
      .then((res) => res.data)
      .catch((err) => handleError(err, `PATCH ${this.endpoint}/${id}`));
  }

  delete(id) {
    return api.delete(`${this.endpoint}/${id}`)
      .then((res) => res.data)
      .catch((err) => handleError(err, `DELETE ${this.endpoint}/${id}`));
  }
}

// 🧑‍💼 Resident APIs
export const ResidentsAPI = new BaseAPI(endpoints.residents);
ResidentsAPI.findByNameAndBirthDate = (fullName, birthDate) =>
  api.get(endpoints.residents, { params: { fullName, birthDate } })
    .then((res) => res.data)
    .catch((err) => handleError(err, "Resident duplicate check"));
ResidentsAPI.verify = (id, verificationStatus, notes) =>
  api.patch(`${endpoints.residents}/${id}/verification`, { verificationStatus, notes })
    .then((res) => res.data)
    .catch((err) => handleError(err, "Resident verification"));

// 🚨 Incident APIs
export const IncidentsAPI = new BaseAPI(endpoints.incidents);
IncidentsAPI.patchStatus = (id, payload) =>
  api.patch(`${endpoints.incidents}/${id}/status`, payload)
    .then((res) => res.data)
    .catch((err) => handleError(err, "Incident status update"));

// 🔎 Public resident (no login) lists their own incidents — mirrors
// BusinessesAPI.listMine/DocumentsAPI's "/my" self-service pattern.
IncidentsAPI.listMinePublic = (residentId) =>
  api.get(`${endpoints.incidents}/my`, { params: { resident_id: residentId } })
    .then((res) => res.data)
    .catch((err) => handleError(err, "List my incidents"));

// 📣 Complaint APIs
export const ComplaintsAPI = {
  listMine: () =>
    api.get(endpoints.complaints.mine)
      .then((res) => res.data)
      .catch((err) => handleError(err, "GET /complaints/mine")),
  // Public resident (no login) equivalent of listMine — identified by
  // resident_id directly since there's no session to derive it from.
  listMinePublic: (residentId) =>
    api.get(`${endpoints.complaints.base}/my`, { params: { resident_id: residentId } })
      .then((res) => res.data)
      .catch((err) => handleError(err, "GET /complaints/my")),
  listAll: () =>
    api.get(endpoints.complaints.all)
      .then((res) => res.data)
      .catch((err) => handleError(err, "GET /complaints/all")),
  create: (data) =>
    api.post(endpoints.complaints.base, data)
      .then((res) => res.data)
      .catch((err) => handleError(err, "POST /complaints")),
  patchStatus: (id, payload) =>
    api.patch(`${endpoints.complaints.base}/${id}/status`, payload)
      .then((res) => res.data)
      .catch((err) => handleError(err, "PATCH complaint status")),
  deleteComplaint: (id) =>
    api.delete(`${endpoints.complaints.base}/${id}`)
      .then((res) => res.data)
      .catch((err) => handleError(err, "DELETE complaint")),
};

// 📄 Document APIs
export const DocumentsAPI = new BaseAPI(endpoints.documents);

// 💵 Payment APIs
export const PaymentsAPI = {
  // Receipts the logged-in staff member personally issued (cash/manual
  // payments they recorded) — scoped server-side to their own uid.
  listMyReceipts: () =>
    api.get("/api/paymongo/receipts/mine")
      .then((res) => res.data)
      .catch((err) => handleError(err, "List my receipts")),
};

export const MessagesAPI = {
  recipients: (q = "") => api.get(`${endpoints.messages}/recipients`, { params: { q } }).then((res) => res.data),
  conversations: () => api.get(`${endpoints.messages}/conversations`).then((res) => res.data),
  createConversation: (recipientUid) => api.post(`${endpoints.messages}/conversations/${recipientUid}`).then((res) => res.data),
  items: (conversationId) => api.get(`${endpoints.messages}/conversations/${conversationId}/items`).then((res) => res.data),
  send: (conversationId, body) => api.post(`${endpoints.messages}/conversations/${conversationId}/items`, { body }).then((res) => res.data),
};

// 🔄 Update document status
DocumentsAPI.patchStatus = (id, payload) =>
  api.patch(`${endpoints.documents}/${id}/status`, payload)
    .then((res) => res.data)
    .catch((err) => handleError(err, "PATCH document status"));

// 💳 Confirm payment
DocumentsAPI.confirmPayment = (id, payload = {}) =>
  api.patch(`${endpoints.documents}/${id}/payment`, payload)
    .then((res) => res.data)
    .catch((err) => handleError(err, "Confirm payment"));

// 📜 Issue document
DocumentsAPI.issue = (id, payload = {}) => {
  const normalizedPayload = {
    ...payload,
    issued_by: payload.issued_by || payload.issuedBy,
  };
  delete normalizedPayload.issuedBy;

  return api.patch(`${endpoints.documents}/${id}/issue`, normalizedPayload)
    .then((res) => res.data)
    .catch((err) => handleError(err, "Issue document"));
};

// 🔄 Mark resubmitted
DocumentsAPI.markResubmitted = (id) =>
  api.patch(`${endpoints.documents}/${id}/resubmission`, { resubmitted: true })
    .then((res) => res.data)
    .catch((err) => handleError(err, "Mark resubmitted"));

// 🏢 Business APIs
export const BusinessesAPI = new BaseAPI(endpoints.businesses);

// 🔎 List all businesses
BusinessesAPI.listAll = () =>
  api.get(endpoints.businesses)
    .then((res) => res.data)
    .catch((err) => handleError(err, "List all businesses"));

// 🔎 List businesses owned by a specific resident
BusinessesAPI.listByOwner = (ownerName) =>
  api.get(endpoints.businesses, { params: { ownerName } })
    .then(res => res.data)
    .catch(err => handleError(err, "List resident businesses"));

// 🔎 List a resident's own businesses — public/unauthenticated, matches
// DocumentsAPI's "/my" self-service pattern for residents without a login.
BusinessesAPI.listMine = (ownerUid) =>
  api.get(`${endpoints.businesses}/my`, { params: { owner_uid: ownerUid } })
    .then((res) => res.data)
    .catch((err) => handleError(err, "List my businesses"));

// `data` is a FormData instance (owner_uid + any documents being replaced)
// — public/unauthenticated, resubmits a rejected application in place and
// resets it to pending_evaluation for staff to re-review.
BusinessesAPI.resubmit = (businessId, data) =>
  api.post(`${endpoints.businesses}/${businessId}/resubmit`, data, {
    headers: { "Content-Type": "multipart/form-data" },
  })
    .then((res) => res.data)
    .catch((err) => handleError(err, "Resubmit business application"));

// `data` is a FormData instance (business fields + document files) — the
// application endpoint is public/unauthenticated and takes multipart uploads
// directly, so no separate authenticated file-upload step is needed here.
BusinessesAPI.createApplication = (data) =>
  api.post(`${endpoints.businesses}/applications`, data, {
    headers: { "Content-Type": "multipart/form-data" },
  })
    .then((res) => res.data)
    .catch((err) => handleError(err, "Create business application"));

export const YouthProgramsAPI = new BaseAPI(endpoints.youth.programs);
export const YouthEventsAPI = new BaseAPI(endpoints.youth.events);
export const YouthFeedbackAPI = new BaseAPI(endpoints.youth.feedback);

export const notifyYouthDataChanged = () => {
  window.dispatchEvent(new Event("youth-data-changed"));
};

// 📝 Audit APIs
export const AuditAPI = {
  list: () =>
    api.get(endpoints.audit)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Audit log fetch")),
  summary: (params = {}) =>
    api.get(`${endpoints.audit}/summary`, { params })
      .then((res) => res.data)
      .catch((err) => handleError(err, "Audit summary fetch")),
  summarySeries: (params = {}) =>
    api.get(`${endpoints.audit}/summary/series`, { params })
      .then((res) => res.data)
      .catch((err) => handleError(err, "Audit summary series fetch")),
  listByDoc: (docId) =>
    api.get(`${endpoints.audit}?documentId=${docId}`) 
      .then((res) => res.data) 
      .catch((err) => handleError(err, "Audit log fetch by doc")),
};

// 🧑‍💼 Account APIs
export const AccountsAPI = {
  create: (data) =>
    api.post(endpoints.accounts.create, data)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Account creation")),
  delete: (uid) =>
    api.delete(endpoints.accounts.delete(uid))
      .then((res) => res.data)
      .catch((err) => handleError(err, "Account deletion")),
  updateRole: (uid, role) =>
    api.put(endpoints.accounts.updateRole(uid), { role })
      .then((res) => res.data)
      .catch((err) => handleError(err, "Account role update")),
  updateProfile: (uid, data) =>
    api.patch(endpoints.accounts.updateProfile(uid), data)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Account profile update")),
  updateMySignature: (signatureUrl) =>
    api.patch(endpoints.accounts.mySignature, { signatureUrl })
      .then((res) => res.data)
      .catch((err) => handleError(err, "Signature update")),
  updatePhoto: (uid, photoUrl) =>
    api.patch(endpoints.accounts.updatePhoto(uid), { photoUrl })
      .then((res) => res.data)
      .catch((err) => handleError(err, "Account photo update")),
  updateRoles: (uid, roles) =>
    api.patch(`/api/admin/accounts/${uid}/roles`, { roles })
      .then((res) => res.data)
      .catch((err) => handleError(err, "Account roles update")),
  list: (params = {}) => 
    api.get("/api/admin/accounts", { params }) 
      .then((res) => res.data) 
      .catch((err) => handleError(err, "List accounts")),
};

export const AuthAPI = {
  switchRole: (role) => api.post(endpoints.auth.switchRole, { role }).then((res) => res.data).catch((err) => handleError(err, "Role switch")),
};

export const PublicServicesAPI = {
  listTenants: () => api.get(endpoints.public.tenants).then((res) => res.data),
  getTenant: (barangayId) => api.get(endpoints.public.tenant(barangayId)).then((res) => res.data),
  register: (formData) =>
    api
      .post(endpoints.public.registrations, formData, { headers: { "Content-Type": "multipart/form-data" } })
      .then((res) => res.data),
  resolve: (identifier, birthDate, barangayId) => api.post(endpoints.public.resolve, { identifier, birthDate, barangayId }).then((res) => res.data),
  requestUpdate: (residentId, barangayId, remarks, document) => {
    const formData = new FormData();
    formData.append("residentId", residentId);
    formData.append("barangayId", barangayId);
    formData.append("remarks", remarks);
    if (document) formData.append("document", document);
    return api
      .post(endpoints.public.requestUpdate, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((res) => res.data);
  },
  submitComplaint: (payload) => api.post(endpoints.public.complaints, payload).then((res) => res.data),
  announcements: (barangayId) => api.get(endpoints.public.announcements, { params: { barangayId } }).then((res) => res.data),
  // Backs the pages the business permit / receipt QR codes link to.
  verifyBusiness: (businessId) => api.get(endpoints.public.verifyBusiness(businessId)).then((res) => res.data),
  verifyReceipt: (receiptNumber) => api.get(endpoints.public.verifyReceipt(receiptNumber)).then((res) => res.data),
};

export const SuperAdminAPI = {
  listTenants: (params = {}) => api.get(endpoints.superAdmin.tenants, { params }).then((res) => res.data),
  createTenant: (payload) => api.post(endpoints.superAdmin.tenants, payload).then((res) => res.data),
  updateTenant: (id, payload) => api.patch(endpoints.superAdmin.tenant(id), payload).then((res) => res.data),
  uploadTenantLogo: (id, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return api
      .post(endpoints.superAdmin.tenantLogo(id), formData, { headers: { "Content-Type": "multipart/form-data" } })
      .then((res) => res.data);
  },
  deleteTenant: (id) => api.delete(endpoints.superAdmin.tenant(id)).then((res) => res.data),
  listCities: () => api.get(endpoints.superAdmin.cities).then((res) => res.data),
  createCity: (payload) => api.post(endpoints.superAdmin.cities, payload).then((res) => res.data),
  updateCity: (id, payload) => api.patch(endpoints.superAdmin.city(id), payload).then((res) => res.data),
  listProvinces: () => api.get(endpoints.superAdmin.provinces).then((res) => res.data),
  createProvince: (payload) => api.post(endpoints.superAdmin.provinces, payload).then((res) => res.data),
  updateProvince: (id, payload) => api.patch(endpoints.superAdmin.province(id), payload).then((res) => res.data),
  deleteProvince: (id) => api.delete(endpoints.superAdmin.province(id)).then((res) => res.data),
  uploadCityLogo: (id, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return api
      .post(endpoints.superAdmin.cityLogo(id), formData, { headers: { "Content-Type": "multipart/form-data" } })
      .then((res) => res.data);
  },
  deleteCity: (id) => api.delete(endpoints.superAdmin.city(id)).then((res) => res.data),
  listAccounts: (params = {}) => api.get(endpoints.superAdmin.accounts, { params }).then((res) => res.data),
  listPayments: (params = {}) => api.get(endpoints.superAdmin.payments, { params }).then((res) => res.data),
  deletePayment: (id) => api.delete(endpoints.superAdmin.payment(id)).then((res) => res.data),
  paymentsSummary: (params = {}) => api.get(endpoints.superAdmin.paymentsSummary, { params }).then((res) => res.data),
  listReceipts: (params = {}) => api.get(endpoints.superAdmin.receipts, { params }).then((res) => res.data),
  deleteReceipt: (id) => api.delete(endpoints.superAdmin.receipt(id)).then((res) => res.data),
};

// 📊 Dashboard APIs
export const DashboardAPI = {
  summary: () =>
    api.get(endpoints.dashboard)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Dashboard summary fetch")),
  
  issuedCount: (documentType) => 
    api.get("/api/documents/count/issued", { params: { documentType } }) 
      .then((res) => res.data) 
      .catch((err) => handleError(err, "Issued count fetch")),
};

export const ReportingAPI = {
  listCounters: () =>
    api.get(endpoints.reporting.counters)
      .then((res) => res.data)
      .catch((err) => handleError(err, "List reporting counters")),
  documentStatuses: () =>
    api.get(endpoints.reporting.documentStatuses)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Get document status totals")),
  listTreasurerPayments: () =>
    api.get(endpoints.reporting.treasurer.payments)
      .then((res) => res.data)
      .catch((err) => handleError(err, "List treasurer payments")),
  listTreasurerReceipts: () =>
    api.get(endpoints.reporting.treasurer.receipts)
      .then((res) => res.data)
      .catch((err) => handleError(err, "List treasurer receipts")),
  listTreasurerBusinesses: () =>
    api.get(endpoints.reporting.treasurer.businesses)
      .then((res) => res.data)
      .catch((err) => handleError(err, "List treasurer businesses")),
  listTreasurerDocuments: () =>
    api.get(endpoints.reporting.treasurer.documents)
      .then((res) => res.data)
      .catch((err) => handleError(err, "List treasurer documents")),
};

// ⚙️ Settings APIs
export const SettingsAPI = {
  getPermissions: () =>
    api.get(endpoints.settings.permissions)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Permission fetch")),
  updatePermissions: (role, permissions) =>
    api.put(endpoints.settings.permissions, { role, permissions })
      .then((res) => res.data)
      .catch((err) => handleError(err, "Permission update")),
};

// 💰 Fees APIs (patched)
export const FeesAPI = {
  // 📄 Document Fees
  listDocuments: (params = {}) =>
    api.get(endpoints.fees.documents, { params })
      .then((res) => res.data)
      .catch((err) => handleError(err, "List document fees")),

  updateDocument: (id, payload) =>
    api.put(`${endpoints.fees.documents}/${id}`, payload)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Update document fee")),

  deleteDocument: (id) =>
    api.delete(`${endpoints.fees.documents}/${id}`)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Delete document fee")),

  // 🏢 Business Fees
  listBusinesses: (params = {}) =>
    api.get(endpoints.fees.businesses, { params })
      .then((res) => res.data)
      .catch((err) => handleError(err, "List business fees")),

  updateBusiness: (id, payload) =>
    api.put(`${endpoints.fees.businesses}/${id}`, payload)
      .then(res => res.data)
      .catch(err => handleError(err, "Update business fee")),

  deleteBusiness: (id) =>
    api.delete(`${endpoints.fees.businesses}/${id}`)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Delete business fee")),

  // 🆕 Miscellaneous Fees
  listMisc: (params = {}) =>
    api.get(endpoints.fees.misc, { params })
      .then((res) => res.data)
      .catch((err) => handleError(err, "List miscellaneous fees")),

  updateMisc: (id, payload) =>
    api.put(`${endpoints.fees.misc}/${id}`, payload)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Update miscellaneous fee")),

  deleteMisc: (id) =>
    api.delete(`${endpoints.fees.misc}/${id}`)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Delete miscellaneous fee")),
};

// 💵 Disbursement APIs
export const DisbursementsAPI = new BaseAPI(endpoints.disbursements);

// 🔄 Extra helpers
DisbursementsAPI.patchStatus = (id, payload) =>
  api.patch(`${endpoints.disbursements}/${id}/status`, payload)
    .then((res) => res.data)
    .catch((err) => handleError(err, "PATCH disbursement status"));

DisbursementsAPI.listByCategory = (category) =>
  api.get(endpoints.disbursements, { params: { category } })
    .then((res) => res.data)
    .catch((err) => handleError(err, "List disbursements by category"));

DisbursementsAPI.listByRecipient = (recipientId) =>
  api.get(endpoints.disbursements, { params: { recipientId } })
    .then((res) => res.data)
    .catch((err) => handleError(err, "List disbursements by recipient"));

// 🧑‍💼 Role APIs
export const RolesAPI = {
  assignRole: (uid, role) =>
    api.post(`/api/users/${uid}/role`, { role })
      .then((res) => res.data)
      .catch((err) => handleError(err, "Assign role")),
};

export const PasswordAPI = {
  requestReset: (email) =>
    api.post(endpoints.password.request, { email })
      .then((res) => res.data)
      .catch((err) => handleError(err, "Password reset request")),

  verifyToken: (token) =>
    api.get(endpoints.password.verify(token))
      .then((res) => res.data)
      .catch((err) => handleError(err, "Password token verification")),

  applyReset: (token, newPassword, confirmPassword) =>
    api.post(endpoints.password.apply, { token, new_password: newPassword, confirm_password: confirmPassword })
      .then((res) => res.data)
      .catch((err) => handleError(err, "Password reset apply")),
};

// 📣 Notification APIs
export const NotificationsAPI = {
  list: () =>
    api.get("/api/notifications/")
      .then((res) => res.data)
      .catch((err) => handleError(err, "List notifications")),

  markAsRead: (id) =>
    api.patch(`/api/notifications/${id}/read`)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Mark notification read")),

  delete: (id) =>
    api.delete(`/api/notifications/${id}`)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Delete notification")),

  bulkDelete: (onlyRead = true) =>
    api.delete(`/api/notifications/actions/bulk-delete?only_read=${onlyRead}`)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Bulk delete notifications")),

  deleteAll: () =>
    api.delete(`/api/notifications/actions/delete-all`)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Delete all notifications")),

  markAllAsRead: () =>
    api.patch(`/api/notifications/actions/mark-all-read`)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Mark all notifications read")),
  
  createResidentLogin: (count) => 
    api.post("/api/notifications/resident-login", { count }) 
      .then((res) => res.data), 

  createResidentLogOut: (count) => 
    api.post("/api/notifications/resident-logout", { count }) 
      .then((res) => res.data), 
      
  createOfficerLogin: (name, role) => 
    api.post("/api/notifications/officer-login", { name, role }) 
      .then((res) => res.data),
  
  createOfficerLogOut: (name, role) => 
    api.post("/api/notifications/officer-logout", { name, role }) 
      .then((res) => res.data),

  createSelfLogOut: async (name, role, count = 1) => {
    try {
      const res = await api.post("/api/notifications/logout-self", { name, role, count });
      return res.data;
    } catch (err) {
      const status = err?.response?.status;
      const normalizedRole = String(role || "").trim().toLowerCase();

      // Compatibility fallback for older backends that do not expose /logout-self.
      if (status === 404 || status === 405) {
        if (normalizedRole === "resident") {
          const res = await api.post("/api/notifications/resident-logout", { count });
          return res.data;
        }

        const res = await api.post("/api/notifications/officer-logout", { name, role: normalizedRole || "officer" });
        return res.data;
      }

      throw err;
    }
  },

  createBusinessSubmitted: (residentName, businessName) =>
    api.post("/api/notifications/business-submitted", {
      resident_name: residentName,
      business_name: businessName,
    }).then((res) => res.data),

  createSkExpense: (activityType, title, category, amount) =>
    api.post("/api/notifications/sk-expense", {
      activity_type: activityType,
      title,
      category,
      amount,
    }).then((res) => res.data),

  createBusinessStatusUpdate: (status, residentUid, businessName, businessId, firestoreId) => {
    const payload = {
      status,
      business_name: businessName,
    };
    if (residentUid) payload.resident_uid = residentUid;
    if (businessId) payload.business_id = businessId;
    if (firestoreId) payload.firestore_id = firestoreId;

    return api.post("/api/notifications/business-status-update", payload)
      .then((res) => res.data);
  },
};

