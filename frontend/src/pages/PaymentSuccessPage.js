// pages/PaymentSuccessPage.js
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import "../styles/payment-success-page.css";

const PaymentSuccessPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.opener) {
        window.close();
      } else {
        const type = params.get("type");
        if (type === "business") {
          navigate("/businesses/my");
        } else {
          navigate("/ownDocuments");
        }
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigate, params]);

  return (
    <div className="payment-success-container">
      <div className="payment-success-card">
        <div className="payment-success-icon">✅</div>
        <h2 className="payment-success-title">GCash Payment successfully received.</h2>
        <p className="payment-success-subtitle">You may now close this window.</p>
      </div>
    </div>
  );
};

export default PaymentSuccessPage;
