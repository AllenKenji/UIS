import React from "react";
import { useUser } from "../../context/UserContext";

const ResidentBusinessPayment = ({ business }) => {
  const { userInfo: user } = useUser();

  const handlePaymentIntent = async (method = "gcash") => {
    try {
      const identifier = business.businessId || business.id;

      // Step 1: Create Payment Intent
      const res = await fetch(`/api/paymongo/create-business-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: identifier,
          businessType: business.businessType,
          feeType: "registrationFee",
          remarks: "Business registration fee",
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("❌ Payment API error:", errText);
        alert("Failed to initiate payment intent.");
        return;
      }

      const data = await res.json();
      const { intent_id, checkout_url, client_key } = data;

      if (checkout_url) {
        // ✅ Payment Link flow
        window.open(checkout_url, "_blank", "noopener,noreferrer");
        return;
      }

      if (!intent_id) {
        alert("No payment intent ID returned.");
        return;
      }

      // Step 2: Attach Payment Method (GCash or GrabPay)
      const attachRes = await fetch(`/api/paymongo/attach-payment-method`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intentId: intent_id,
          clientKey: client_key, // ✅ include client_key
          method: method,        // "gcash" or "grab_pay"
          billing: {
            name: user?.name || "Resident",
            email: user?.email || "resident@example.com",
          },
        }),
      });

      if (!attachRes.ok) {
        const errText = await attachRes.text();
        console.error("❌ Attach method error:", errText);
        alert("Failed to attach payment method.");
        return;
      }

      const attachData = await attachRes.json();
      const redirectUrl = attachData?.redirect_url;

      if (redirectUrl) {
        // ✅ Open PayMongo checkout
        window.open(redirectUrl, "_blank", "noopener,noreferrer");
      } else {
        alert("Payment method attached but no redirect URL returned.");
      }
    } catch (err) {
      console.error("❌ Payment intent flow error:", err);
      alert("Unexpected error during payment.");
    }
  };

  return (
    <div className="resident-business-payment">
      <p>💳 Choose a payment method:</p>
      <button className="pay-btn" onClick={() => handlePaymentIntent("gcash")}>
        Pay with GCash
      </button>
      <button className="pay-btn" onClick={() => handlePaymentIntent("grab_pay")}>
        Pay with GrabPay
      </button>
    </div>
  );
};

export default ResidentBusinessPayment;
