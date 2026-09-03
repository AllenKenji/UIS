import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PublicServicesAPI } from "../../services/api";
import "../public-services.css";

// Landing page the business permit QR code links to — lets anyone who
// scans it (a resident, an inspector, another business) confirm the
// permit is real without needing an account.
export default function VerifyBusiness() {
  const { businessId } = useParams();
  const [business, setBusiness] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    PublicServicesAPI.verifyBusiness(businessId)
      .then(setBusiness)
      .catch((err) => setError(err.response?.data?.detail || "Could not verify this permit."))
      .finally(() => setLoading(false));
  }, [businessId]);

  return (
    <main className="public-services">
      <section className="public-card">
        {loading ? (
          <p>Checking permit…</p>
        ) : error ? (
          <>
            <h1>❌ Not Verified</h1>
            <p className="public-error">{error}</p>
            <p className="public-note">Business ID: {businessId}</p>
          </>
        ) : (
          <>
            <h1>✅ Verified Business Permit</h1>
            <div className="public-profile-details">
              <p><strong>Business:</strong> {business.businessName}</p>
              <p><strong>Type:</strong> {business.businessType}</p>
              <p><strong>Owner:</strong> {business.ownerName}</p>
              <p><strong>Barangay:</strong> {business.barangay}</p>
              <p><strong>Permit Number:</strong> {business.permitNumber || "—"}</p>
              <p><strong>Business ID:</strong> {business.businessId}</p>
              {business.approvedAt && (
                <p><strong>Approved:</strong> {new Date(business.approvedAt).toLocaleDateString()}</p>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
