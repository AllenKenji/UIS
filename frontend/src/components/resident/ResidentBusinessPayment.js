import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "../../services/api";

const ResidentBusinessPayment = ({ business }) => {
  const { userInfo: user } = useUser();

  const handlePayment = async (method = "gcash") => {
    try {
      const identifier = business.businessId || business.id;
      const returnUrl = `${window.location.origin}/payment-success?type=business`;

      // Step 1: Request backend to create a PayMongo Payment Link or Intent
      const res = await fetch(`${API_BASE_URL}/api/paymongo/create-business-link`, {
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
        alert("Failed to initiate payment.");
        return;
      }

      const data = await res.json();

      // ✅ Payment Link flow
      if (data.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
        return;
      }

      // ✅ Payment Intent flow
      if (data.paymentIntentId && data.paymongoClientKey) {
        const attachRes = await fetch(`${API_BASE_URL}/api/paymongo/attach-payment-method`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentIntentId: data.paymentIntentId,   
            paymongoClientKey: data.paymongoClientKey, 
            method,
            billing: {
              name: user?.name || "Resident",
              email: user?.email || "resident@example.com",
            },
            type: "business",
            return_url: returnUrl,
          }),
        });

        if (!attachRes.ok) {
          const errText = await attachRes.text();
          console.error("❌ Attach method error:", errText);
          alert("Failed to attach payment method.");
          return;
        }

        const attachData = await attachRes.json();
        const redirectUrl = attachData?.redirectUrl;

        if (redirectUrl) {
          window.open(redirectUrl, "_blank", "noopener,noreferrer");
        } else {
          alert("Payment method attached but no redirect URL returned.");
        }
        return;
      }

      // If neither flow returned usable data
      alert("No valid payment link or intent returned.");
    } catch (err) {
      console.error("❌ Payment flow error:", err);
      alert("Unexpected error during payment.");
    }
  };

  return (
    <div className="resident-business-payment">
      <p>💳 Choose a payment method:</p>
      <button className="pay-btn" onClick={() => handlePayment("gcash")}>
        Pay with GCash
      </button>
      <button className="pay-btn" onClick={() => handlePayment("grab_pay")}>
        Pay with GrabPay
      </button>
    </div>
  );
};

export default ResidentBusinessPayment;