import { useEffect, useRef, useState } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../../services/firebase";
import { useUser } from "../../context/UserContext";
import { API_BASE_URL } from "../../services/api";
import { QRCodeCanvas } from "qrcode.react";
import ResidentBusinessPayment from "./ResidentBusinessPayment";
import "../../styles/resident/resident-business-dashboard.css";

const resolveDocumentUrl = (business, key) => {
  const nested = business?.documents?.[key];
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object") return nested.url || null;

  const legacy = business?.[key];
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy === "object") return legacy.url || null;

  return null;
};

const ResidentBusinessDashboard = () => {
  const { userInfo: user } = useUser();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("inProgress");
  const reconciledRef = useRef(new Set());

  useEffect(() => {
    if (!user?.email) {
      setBusinesses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, "businesses"), where("email", "==", user.email));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setBusinesses(data);
        setLoading(false);
      },
      (error) => {
        console.error("❌ Firebase fetch error:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

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
    const status = (rawPaymentStatus === "paid" || rawPaymentStatus === "succeeded")
      ? "paid"
      : (rawStatus || rawPaymentStatus || "pending_evaluation");

    if (status === "approved") {
      const approvedDate = b.submittedAt ? new Date(b.submittedAt) : new Date();
      const validUntil = new Date(approvedDate);
      validUntil.setFullYear(validUntil.getFullYear() + 1);

      return (
        <div className="qr-wrapper">
          <p><strong>Permit Number:</strong> {b.permitNumber}</p>
          <QRCodeCanvas value={b.businessId || b.id} size={96} />
          <p><strong>Valid Until:</strong> {validUntil.toLocaleDateString()}</p>
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
      case "rejected":
        return (
          <p className="warning-text">
            ❌ Application was rejected. Notes: {b.notes || "No reason provided."}
          </p>
        );
      default:
        return <p className="info-text">ℹ️ Status: {status}</p>;
    }
  };

  const renderDocuments = (b) => {
    const docs = [
      { key: "validId", label: "Valid ID" },
      { key: "proofOfAddress", label: "Proof of Address" },
      { key: "dtiCert", label: "DTI Certificate" },
      { key: "businessLogo", label: "Business Logo" },
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
