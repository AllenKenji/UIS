import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const PaymentCancelPage = () => {
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
    <div className="payment-cancel">
      <h2>❌ Payment Cancelled</h2>
      <p>Your payment was cancelled or failed. No charges were made.</p>
      <p>You will be redirected or the window will close shortly…</p>
    </div>
  );
};

export default PaymentCancelPage;
