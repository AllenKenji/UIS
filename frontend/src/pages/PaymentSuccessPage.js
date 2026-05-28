// pages/PaymentSuccessPage.js
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../services/api";
import "../styles/payment-success-page.css";

const PaymentSuccessPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    let timer;

    const reconcile = async () => {
      const type = params.get("type");
      const businessId = params.get("businessId");
      const documentId = params.get("documentId");

      try {
        if (type === "business" && businessId) {
          await fetch(`${API_BASE_URL}/api/paymongo/reconcile-return`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "business", businessId }),
          });
        } else if (type === "document" && documentId) {
          await fetch(`${API_BASE_URL}/api/paymongo/reconcile-return`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "document", documentId }),
          });
        }
      } catch (error) {
        // Reconciliation is best-effort; webhook can still update status.
        console.warn("⚠️ Payment reconciliation request failed", error);
      }

      timer = setTimeout(() => {
        if (window.opener) {
          window.close();
        } else if (type === "business") {
          navigate("/businesses/my");
        } else {
          navigate("/ownDocuments");
        }
      }, 3000);
    };

    reconcile();

    return () => {
      if (timer) clearTimeout(timer);
    };
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
