import PropTypes from "prop-types";
import { Navigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";

const ProtectedRoute = ({
  allowedRoles = [],
  allowAdminOverride = true,
  fallback = null,
  redirectPath = "/unauthorized",
  children,
}) => {
  const { isAuthenticated, loading, hasAccess, role } = useUser();

  // ⏳ Show fallback while loading
  if (loading) {
    return fallback || <div className="loading">🔄 Verifying access…</div>;
  }

  // 🔐 Redirect if not logged in
  if (!isAuthenticated) {
    console.info("🔐 Redirecting unauthenticated user to login.");
    return <Navigate to="/login" replace />;
  }

  // 🚫 Redirect if role is not allowed
  if (!hasAccess(allowedRoles, allowAdminOverride)) {
    console.warn(
      `🚫 Access denied for role "${role}". Allowed roles: [${allowedRoles.join(", ")}]`
    );
    return <Navigate to={redirectPath} replace />;
  }

  // ✅ Authorized
  return children;
};

ProtectedRoute.propTypes = {
  allowedRoles: PropTypes.arrayOf(PropTypes.string),
  allowAdminOverride: PropTypes.bool,
  fallback: PropTypes.node,
  redirectPath: PropTypes.string,
  children: PropTypes.node.isRequired,
};

export default ProtectedRoute;
