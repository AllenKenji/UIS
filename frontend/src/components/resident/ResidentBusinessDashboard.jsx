import { useEffect, useRef, useState } from "react";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL, BusinessesAPI } from "../../services/api";
import { QRCodeCanvas } from "qrcode.react";
import ResidentBusinessPayment from "./ResidentBusinessPayment";
import BusinessResubmissionForm from "./BusinessResubmissionForm";
import "../../styles/resident/resident-business-dashboard.css";

// Documents are stored server-side under snake_case keys (valid_id,
// proof_of_address, dti_cert, business_logo — see BusinessDocuments in
// backend/app/models/business.py), and their url is a backend-relative
// path (e.g. "/storage/...") that needs the API host prefixed.
const resolveUrl = (url) => (url?.startsWith("/") ? `${API_BASE_URL}${url}` : url || null);

const resolveDocumentUrl = (business, key) => {
  const nested = business?.documents?.[key];
  if (typeof nested === "string") return resolveUrl(nested);
  if (nested && typeof nested === "object") return resolveUrl(nested.url);

  const legacy = business?.[key];
  if (typeof legacy === "string") return resolveUrl(legacy);
  if (legacy && typeof legacy === "object") return resolveUrl(legacy.url);

  return null;
};

const ResidentBusinessDashboard = ({ residentId } = {}) => {
  const { userInfo: user } = useUser();
  // Public residents (registered via the barangay portal) never log in, so
  // they're identified by residentId passed in directly rather than the
  // logged-in user context — same pattern as MyDocuments/useMyDocuments.
  const ownerUid = residentId || user?.uid;
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("inProgress");
  const [resubmittingId, setResubmittingId] = useState(null);
  const reconciledRef = useRef(new Set());

  const refresh = () => {
    if (!ownerUid) {
      setBusinesses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    BusinessesAPI.listMine(ownerUid)
      .then((all) => setBusinesses(Array.isArray(all) ? all : []))
      .catch((error) => console.error("Failed to load businesses:", error))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [ownerUid]);

  useEffect(() => {
    const reconcileAwaiting = async () => {
      for (const b of businesses) {
        const status = String(b.status || "").toLowerCase();
        const paymentStatus = String(b.paymentStatus || "").toLowerCase();
        const identifier = b.businessId || b.id;

        if (!identifier) continue;
        if (paymentStatus === "paid" || paymentStatus === "succeeded") continue;
        if (!["awaiting_payment", "for_payment"].includes(status)) continue;
        if (!b.paymongoLinkId && !b.paymentIntentId) continue;
        if (reconciledRef.current.has(identifier)) continue;

        reconciledRef.current.add(identifier);
        try {
          await fetch(`${API_BASE_URL}/api/paymongo/reconcile-return`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "business", businessId: identifier }),
          });
        } catch (error) {
          console.warn("⚠️ Auto reconcile failed for business", identifier, error);
        }
      }
    };

    if (businesses.length > 0) {
      reconcileAwaiting();
    }
  }, [businesses]);

  const renderStatus = (b) => {
    const rawStatus = String(b.status || "").toLowerCase();
    const rawPaymentStatus = String(b.paymentStatus || "").toLowerCase();
    const status = ["approved", "expired", "rejected"].includes(rawStatus)
      ? rawStatus
      : (rawPaymentStatus === "paid" || rawPaymentStatus === "succeeded")
        ? "paid"
        : (rawStatus || rawPaymentStatus || "pending_evaluation");

    if (status === "approved") {
      // validUntil is set server-side the moment a business is approved
      // (see _assign_permit_fields in business_routes.py). Older records
      // approved before that existed won't have it — fall back to the old
      // submittedAt+1yr estimate only for those.
      const validUntil = b.validUntil
        ? new Date(b.validUntil)
        : (() => {
            const approvedDate = b.submittedAt ? new Date(b.submittedAt) : new Date();
            const fallback = new Date(approvedDate);
            fallback.setFullYear(fallback.getFullYear() + 1);
            return fallback;
          })();
      const daysLeft = Math.ceil((validUntil - new Date()) / (1000 * 60 * 60 * 24));
      const isExpiringSoon = daysLeft <= 30;

      return (
        <div className="qr-wrapper">
          <p><strong>Permit Number:</strong> {b.permitNumber}</p>
          <QRCodeCanvas value={`${window.location.origin}/verify/business/${b.businessId || b.id}`} size={96} />
          <p><strong>Valid Until:</strong> {validUntil.toLocaleDateString()}</p>
          {isExpiringSoon && (
            <div className="warning-text">
              <p>⚠️ Your permit expires in {daysLeft} day{daysLeft === 1 ? "" : "s"}. Pay the annual renewal fee to keep it active.</p>
              <ResidentBusinessPayment business={b} feeType="annual" />
            </div>
          )}
        </div>
      );
    }

    if (status === "expired") {
      return (
        <div className="warning-text">
          <p>⛔ This permit has expired. Pay the annual renewal fee to reactivate it.</p>
          {b.permitNumber && <p><strong>Permit Number:</strong> {b.permitNumber}</p>}
          <ResidentBusinessPayment business={b} feeType="annual" />
        </div>
      );
    }

    switch (status) {
      case "pending_evaluation":
        return <p className="pending-text">⏳ Application submitted. Awaiting staff evaluation.</p>;
      case "for_payment":
      case "awaiting_payment":
        return (
          <div className="payment-section">
            <p>💳 Your application is ready for payment.</p>
            <ResidentBusinessPayment business={b} />
          </div>
        );
      case "payment_submitted":
      case "paid":
        return <p className="info-text">⏳ Payment submitted. Awaiting staff verification.</p>;
      case "rejected": {
        const identifier = b.businessId || b.id;
        if (resubmittingId === identifier) {
          return (
            <BusinessResubmissionForm
              business={b}
              onCancel={() => setResubmittingId(null)}
              onSuccess={() => {
                setResubmittingId(null);
                refresh();
              }}
            />
          );
        }
        return (
          <div>
            <p className="warning-text">
              ❌ Application was rejected. Notes: {b.notes || "No reason provided."}
            </p>
            <button type="button" onClick={() => setResubmittingId(identifier)}>
              🔄 Reapply
            </button>
          </div>
        );
      }
      default:
        return <p className="info-text">ℹ️ Status: {status}</p>;
    }
  };

  const renderDocuments = (b) => {
    const docs = [
      { key: "valid_id", label: "Valid ID" },
      { key: "proof_of_address", label: "Proof of Address" },
      { key: "dti_cert", label: "DTI Certificate" },
      { key: "business_logo", label: "Business Logo" },
    ];

    return (
      <div className="documents-list">
        {docs.map(
          ({ key, label }) => {
            const url = resolveDocumentUrl(b, key);
            return url && (
              <p key={key}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  📎 View {label}
                </a>
              </p>
            );
          }
        )}
      </div>
    );
  };

  // "Approved" means currently valid — an expired permit needs the resident
  // to act (pay the renewal fee), same as a pending/for_payment application,
  // so it belongs in "In Progress" instead of sitting in "Approved" looking
  // like nothing's wrong.
  const approvedBusinesses = businesses.filter((b) => b.status === "approved");
  const inProgressBusinesses = businesses.filter((b) => b.status !== "approved");
  const listToRender = activeTab === "inProgress" ? inProgressBusinesses : approvedBusinesses;

  return (
    <div className="resident-business-dashboard">
      <h2>🏢 My Business Applications</h2>

      <div className="tabs">
        <button
          className={activeTab === "inProgress" ? "active" : ""}
          onClick={() => setActiveTab("inProgress")}
        >
          🕑 In Progress
        </button>
        <button
          className={activeTab === "approved" ? "active" : ""}
          onClick={() => setActiveTab("approved")}
        >
          ✅ Approved
        </button>
      </div>

      {loading ? (
        <p>Loading your businesses...</p>
      ) : listToRender.length === 0 ? (
        <p>No businesses found in this tab.</p>
      ) : (
        <div className="business-grid">
          {listToRender.map((b) => (
            <div
              key={b.id}
              className={`business-card ${b.status === "approved" ? "approved-card" : ""}`}
            >
              {b.status === "approved" && (
                <div className="approved-badge">APPROVED ✅</div>
              )}

              <h3>{b.businessName}</h3>

              <div className="card-section">
                <p><strong>Type:</strong> {b.businessType}</p>
                <p><strong>Barangay:</strong> {b.barangay}</p>
                <p>
                  <strong>Address:</strong>{" "}
                  {[b.street, b.barangay, b.city, b.province].filter(Boolean).join(", ")}
                </p>
              </div>

              <div className="card-section">
                {renderDocuments(b)}
              </div>

              <div className="card-section">
                {renderStatus(b)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ResidentBusinessDashboard;
