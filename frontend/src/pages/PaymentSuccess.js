import React, { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth"; // 🔎 replace with your auth hook/context

const PaymentSuccess = () => {
  const { user } = useAuth(); // assumes you have a user object when logged in
  const navigate = useNavigate();
  const location = useLocation();

  // Optional: auto‑redirect logged‑in users after a short delay
  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        navigate("/resident/business-dashboard");
      }, 4000); // redirect after 4 seconds
      return () => clearTimeout(timer);
    }
  }, [user, navigate]);

  // Extract query params if you want to show extra info
  const params = new URLSearchParams(location.search);
  const type = params.get("type"); // "business" or "document"

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
