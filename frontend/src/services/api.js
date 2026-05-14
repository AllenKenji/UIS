import axios from "axios";
import { getAuth, onAuthStateChanged } from "firebase/auth";

const isDevelopment = process.env.NODE_ENV !== "production";
const rawEnvApiBaseUrl = process.env.REACT_APP_API_BASE_URL || "";

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
  (isDevelopment ? "http://127.0.0.1:8000" : "https://asia-southeast1-barangay-1721d.cloudfunctions.net/sendEmailAsia");

console.log("🌐 API Base URL:", API_BASE_URL);

  if (process.env.NODE_ENV === "production" && API_BASE_URL.startsWith("http://")) { 
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
  audit: "/api/document_audit",
  dashboard: "/dashboard-summary",
  disbursements: "/api/disbursements",
  accounts: {
    create: "/api/admin/create-account",
    updateRole: (uid) => `/api/admin/update-role/${uid}`,
    delete: (uid) => `/api/admin/delete-account/${uid}`,
    list: "/api/admin/accounts",
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
};

// 🛡️ Axios instance
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

const waitForAuthUser = (auth, timeoutMs = 1200) =>
  new Promise((resolve) => {
    if (auth.currentUser) {
      resolve(auth.currentUser);
      return;
    }

    let settled = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve(user || null);
    });

    setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      resolve(auth.currentUser || null);
    }, timeoutMs);
  });

// 🔐 Always inject a fresh token 
api.interceptors.request.use(async (config) => {
  const auth = getAuth();
  const cachedToken = sessionStorage.getItem("authToken");

  if (config.url?.includes("/api/password/")) { return config; }

  let tokenToUse = cachedToken;
  const user = auth.currentUser || await waitForAuthUser(auth);

  if (user) {
    try {
      const freshToken = await user.getIdToken(false);
      tokenToUse = freshToken || tokenToUse;
      if (freshToken) {
        sessionStorage.setItem("authToken", freshToken);
      }
    } catch (err) {
      console.warn("⚠️ Failed to refresh Firebase token", err);
    }
  }

  if (tokenToUse) {
    config.headers.Authorization = `Bearer ${tokenToUse}`;
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
  if (process.env.NODE_ENV !== "production") {
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

// 🚨 Incident APIs
export const IncidentsAPI = new BaseAPI(endpoints.incidents);
IncidentsAPI.patchStatus = (id, payload) =>
  api.patch(`${endpoints.incidents}/${id}/status`, payload)
    .then((res) => res.data)
    .catch((err) => handleError(err, "Incident status update"));

// 📣 Complaint APIs
export const ComplaintsAPI = {
  listMine: () =>
    api.get(endpoints.complaints.mine)
      .then((res) => res.data)
      .catch((err) => handleError(err, "GET /complaints/mine")),
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

// 📝 Audit APIs
export const AuditAPI = {
  list: () =>
    api.get(endpoints.audit)
      .then((res) => res.data)
      .catch((err) => handleError(err, "Audit log fetch")),
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
  list: (params = {}) => 
    api.get("/api/admin/accounts", { params }) 
      .then((res) => res.data) 
      .catch((err) => handleError(err, "List accounts")),
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
  listDocuments: () =>
    api.get(endpoints.fees.documents)
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
  listBusinesses: () =>
    api.get(endpoints.fees.businesses)
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
  listMisc: () =>
    api.get(endpoints.fees.misc)
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

  createBusinessSubmitted: (residentName, businessName) =>
    api.post("/api/notifications/business-submitted", {
      resident_name: residentName,
      business_name: businessName,
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

