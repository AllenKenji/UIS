import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useUser } from "../context/UserContext";

import ProtectedRoute from "../components/auth/ProtectedRoute";
import MainLayout from "../components/MainLayout";
import PublicLayout from "../components/PublicLayout";
import PaymentSuccessPage from "../pages/PaymentSuccessPage";
import PaymentCancelPage from "../pages/PaymentCancelPage";

import Login from "../pages/Login";
import ResetPassword from "../pages/ResetPassword";
import Unauthorized from "../pages/Unauthorized";
import NotFound from "../pages/NotFound";

import ResidentRegistry from "../components/ResidentRegistry";
import ResidentForm from "../components/forms/ResidentForm";
import BusinessDashboard from "../pages/BusinessDashboard";
import BusinessForm from "../components/forms/BusinessForm";
import StaffBusinessForm from "../components/forms/StaffBusinessForm";
import DocumentsAdmin from "../pages/DocumentsAdmin";
import ComplaintForm from "../components/forms/ComplaintForm";
import IncidentForm from "../components/forms/IncidentForm";
import Incidents from "../pages/Incidents";

import Complaints from "../pages/Complaints";
import ResidentBusinessDashboard from "../components/resident/ResidentBusinessDashboard";
import MyIncidents from "../components/resident/MyIncidents";
import FeeDashboard from "../pages/FeeDashboard";

import CreateAccountForm from "../components/admin/CreateAccountForm";

// Dashboard pages
import AdminDashboard from "../pages/AdminDashboard";
import StaffDashboard from "../pages/StaffDashboard";
import ResidentDashboard from "../pages/ResidentDashboard";
import SecretaryDashboard from "../pages/SecretaryDashboard";
import TreasurerDashboard from "../pages/TreasurerDashboard";
import SKDashboard from "../pages/SKDashboard";
import AuditView from "../pages/AuditView";
import CfdpSurveyModule from "../pages/CfdpSurveyModule";

import ComplaintList from "../components/dashboard/ComplaintList";

// Resident sidebar components
import ResidentDocumentRequestForm from "../components/resident/ResidentDocumentRequestForm";
import MyDocuments from "../components/resident/MyDocuments";
import ResubmissionPage from "../components/resident/ResubmissionPage";

// Secretary sidebar components
import SecretaryDocumentForm from "../components/forms/SecretaryDocumentForm";
import PendingRequests from "../components/secretary/PendingRequests";
import PaidRequests from "../components/secretary/PaidRequests";
import IssuedDocuments from "../components/secretary/IssuedDocuments";
import RejectedRequests from "../components/secretary/RejectedRequests";

import Collections from "../components/treasurer/Collections";
import Disbursements from "../components/treasurer/Disbursements";
import Reports from "../components/treasurer/Reports";
import Settings from "../components/treasurer/Settings";


const AppRoutes = ({ isDarkMode, toggleDarkMode }) => {
  const { userInfo, role, loading } = useUser();
  const location = useLocation();
  const normalizedRole = role?.trim().toLowerCase();

  const roleRedirects = {
    admin: "/admin",
    surveyor: "/cfdp-survey",
    supervisor: "/cfdp-survey",
    staff: "/staff",
    resident: "/resident",
    secretary: "/secretary",
    treasurer: "/treasurer",
    sk: "/youth",
    dilg: "/audit",
  };

  const getRedirectPath = () => {
    if (!normalizedRole) return "/unauthorized";
    return roleRedirects[normalizedRole] || "/unauthorized";
  };

  const isPublicRoute = ["/login", "/reset-password", "/unauthorized", "/payment-success", "/payment-cancel"].includes(location.pathname);

  if (loading && !isPublicRoute) {
    return <div className="loading">🔄 Loading user data…</div>;
  }

  return (
    <div className={`App ${isDarkMode ? "dark-mode" : "light-mode"}`}>
      <main>
        <Routes>
          {/* Public Routes */}
          <Route element={<PublicLayout />}>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/payment-success" element={<PaymentSuccessPage />} />
            <Route path="/payment-cancel" element={<PaymentCancelPage />} /> 
          </Route>

          {/* Protected Routes */}
          <Route
            element={
              <MainLayout
                user={userInfo}
                toggleDarkMode={toggleDarkMode}
                isDarkMode={isDarkMode}
              />
            }
          >
            {/* Root redirect */}
            <Route
              path="/"
              element={
                loading ? ( 
                  <div className="loading">🔄 Restoring session…</div>  
                ) : userInfo && normalizedRole ? (
                    <Navigate to={getRedirectPath()} replace />
                ) : userInfo ? (
                    <Navigate to="/unauthorized" replace />
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />

            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* Admin */}
            <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/accounts/new" element={<ProtectedRoute allowedRoles={["admin"]}><CreateAccountForm /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute allowedRoles={["admin"]}><FeeDashboard/></ProtectedRoute>} />

            {/* Staff */}
            <Route path="/staff" element={<ProtectedRoute allowedRoles={["staff"]}><StaffDashboard /></ProtectedRoute>} />
            <Route path="/complaints/evaluate" element={<ProtectedRoute allowedRoles={["staff"]}><Complaints /></ProtectedRoute>} />

            {/* Resident */}
            <Route path="/resident" element={<ProtectedRoute allowedRoles={["resident"]} allowAdminOverride={false}><ResidentDashboard residentId={userInfo?.uid} /></ProtectedRoute>} /> 
            <Route path="/myComplaints" element={<ProtectedRoute allowedRoles={["resident"]} allowAdminOverride={false}><ComplaintList residentId={userInfo?.uid} /></ProtectedRoute>} />
            <Route path="/businesses/new" element={<ProtectedRoute allowedRoles={["resident"]} allowAdminOverride={false}><BusinessForm residentId={userInfo?.uid} /></ProtectedRoute>} />
            <Route path="/businesses/my" element={<ProtectedRoute allowedRoles={["resident"]} allowAdminOverride={false}><ResidentBusinessDashboard residentId={userInfo?.uid} /></ProtectedRoute>} />
            <Route path="/incidents/new" element={<ProtectedRoute allowedRoles={["resident"]} allowAdminOverride={false}><IncidentForm isReportMode={true} residentId={userInfo?.uid} /></ProtectedRoute>} />
            <Route path="/myIncidents" element={<ProtectedRoute allowedRoles={["resident"]} allowAdminOverride={false}><MyIncidents residentId={userInfo?.uid} /></ProtectedRoute>} />
            <Route path="/documents/request" element={<ProtectedRoute allowedRoles={["resident"]} allowAdminOverride={false}><ResidentDocumentRequestForm isRequestMode={true} residentId={userInfo?.uid} residentName={userInfo?.fullName} /></ProtectedRoute>} />
            <Route path="/ownDocuments" element={<ProtectedRoute allowedRoles={["resident"]} allowAdminOverride={false}><MyDocuments residentId={userInfo?.uid} /></ProtectedRoute>} />
            <Route path="/resubmit/:docId" element={<ProtectedRoute allowedRoles={["resident"]} allowAdminOverride={false}><ResubmissionPage /></ProtectedRoute>} />

            {/* Secretary */}
            <Route path="/secretary" element={<ProtectedRoute allowedRoles={["secretary"]}><SecretaryDashboard /></ProtectedRoute>} />
            <Route path="/secretary/documents" element={<ProtectedRoute allowedRoles={["secretary"]}><SecretaryDocumentForm /></ProtectedRoute>} />
            <Route path="/secretary/pending" element={<ProtectedRoute allowedRoles={["secretary"]}><PendingRequests /></ProtectedRoute>} />
            <Route path="/secretary/payments" element={<ProtectedRoute allowedRoles={["secretary"]}><PaidRequests /></ProtectedRoute>} />
            <Route path="/secretary/issued" element={<ProtectedRoute allowedRoles={["secretary"]}><IssuedDocuments /></ProtectedRoute>} />
            <Route path="/secretary/rejected" element={<ProtectedRoute allowedRoles={["secretary"]}><RejectedRequests /></ProtectedRoute>} />

            {/* Treasurer */}
            <Route path="/treasurer" element={<ProtectedRoute allowedRoles={["admin","treasurer"]}><TreasurerDashboard /></ProtectedRoute>} />
            <Route path="/treasurer/incoming" element={<ProtectedRoute allowedRoles={["treasurer"]}><Collections /></ProtectedRoute>} />
            <Route path="/treasurer/expenses" element={<ProtectedRoute allowedRoles={["treasurer"]}><Disbursements /></ProtectedRoute>} />
            <Route path="/treasurer/reports" element={<ProtectedRoute allowedRoles={["treasurer"]}><Reports /></ProtectedRoute>} />
            <Route path="/treasurer/settings" element={<ProtectedRoute allowedRoles={["treasurer"]}><Settings /></ProtectedRoute>} />

            {/* SK */}
            <Route path="/youth" element={<ProtectedRoute allowedRoles={["admin","sk"]}><SKDashboard /></ProtectedRoute>} />
            <Route path="/youth/registry" element={<ProtectedRoute allowedRoles={["admin","sk"]}><SKDashboard /></ProtectedRoute>} />
            <Route path="/youth/programs" element={<ProtectedRoute allowedRoles={["admin","sk"]}><SKDashboard /></ProtectedRoute>} />
            <Route path="/youth/events" element={<ProtectedRoute allowedRoles={["admin","sk"]}><SKDashboard /></ProtectedRoute>} />
            <Route path="/youth/feedback" element={<ProtectedRoute allowedRoles={["admin","sk"]}><SKDashboard /></ProtectedRoute>} />

            {/* DILG Auditor */}
            <Route path="/audit" element={<ProtectedRoute allowedRoles={["dilg"]}><AuditView /></ProtectedRoute>} />

            {/* Embedded CFDP Survey System */}
            <Route
              path="/cfdp-survey"
              element={
                <ProtectedRoute allowedRoles={["admin", "surveyor", "supervisor"]} allowAdminOverride={false}>
                  <CfdpSurveyModule />
                </ProtectedRoute>
              }
            />

            {/* Admin + Staff shared */}
            <Route path="/residents" element={<ProtectedRoute allowedRoles={["admin","staff"]}><ResidentRegistry /></ProtectedRoute>} />
            <Route path="/residents/new" element={<ProtectedRoute allowedRoles={["admin","staff"]}><ResidentForm user={userInfo} /></ProtectedRoute>} />
            <Route path="/businesses" element={<ProtectedRoute allowedRoles={["admin","staff"]}><BusinessDashboard /></ProtectedRoute>} />
            <Route path="/residentBusinesses" element={<ProtectedRoute allowedRoles={["admin","staff"]}><StaffBusinessForm /></ProtectedRoute>} />
            <Route path="/allComplaints" element={<ProtectedRoute allowedRoles={["admin","staff"]}><Complaints /></ProtectedRoute>} />
            <Route path="/incidents" element={<ProtectedRoute allowedRoles={["admin","staff"]}><Incidents /></ProtectedRoute>} />

            {/* Secretary + Admin shared */}
            <Route path="/documents" element={<ProtectedRoute allowedRoles={["admin","secretary"]}><DocumentsAdmin /></ProtectedRoute>} />

            {/* Resident + Admin + Staff shared */}
            <Route path="/complaints/new" element={<ProtectedRoute allowedRoles={["resident","staff","admin"]} allowAdminOverride={false}><ComplaintForm residentId={userInfo?.uid} /></ProtectedRoute>} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
};

export default AppRoutes;
