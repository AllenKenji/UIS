import { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const PaymentSuccess = () => {
  const { user } = useAuth(); 
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        navigate("/resident/business-dashboard");
      }, 4000); 
      return () => clearTimeout(timer);
    }
  }, [user, navigate]);

  const params = new URLSearchParams(location.search);
  const type = params.get("type"); 

  return (
    <div className="payment-success">
      <h2>✅ Payment submitted</h2>
      <p>
        Your {type || "application"} payment has been submitted successfully.
        We’ll notify you once staff verifies.
      </p>

      {user ? (
        <Link to="/resident/business-dashboard" className="btn">
          Go to My Dashboard
        </Link>
      ) : (
        <Link to="/login" className="btn">
          Login to view your dashboard
        </Link>
      )}
    </div>
  );
};

export default PaymentSuccess;
