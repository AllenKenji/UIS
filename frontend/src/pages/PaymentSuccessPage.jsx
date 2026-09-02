// pages/PaymentSuccessPage.js
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "../services/api";
import "../styles/payment-success-page.css";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
        const payload =
          type === "business" && businessId
            ? { type: "business", businessId }
            : type === "document" && documentId
              ? { type: "document", documentId }
              : null;

        if (payload) {
          for (let attempt = 1; attempt <= 4; attempt += 1) {
            const response = await fetch(`${API_BASE_URL}/api/paymongo/reconcile-return`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });

            if (response.ok) {
              const result = await response.json();
              const paid = (result?.paymentStatus || "").toLowerCase() === "paid" || (result?.status || "").toLowerCase() === "paid";
              if (paid || result?.updated) break;
            }

            await sleep(1800);
          }
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
