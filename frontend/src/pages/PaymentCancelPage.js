// pages/PaymentCancelPage.js
import React, { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const PaymentCancelPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.opener) {
        // If checkout was opened in a popup
        window.close();
      } else {
        // If same tab, decide where to go
        const type = params.get("type"); // "document" or "business"
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
    <div className="payment-cancel">
      <h2>❌ Payment Cancelled</h2>
      <p>Your payment was cancelled or failed. No charges were made.</p>
      <p>You will be redirected or the window will close shortly…</p>
    </div>
  );
};

export default PaymentCancelPage;
