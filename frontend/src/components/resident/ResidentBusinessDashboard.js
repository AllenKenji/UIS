import React, { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase";
import { useUser } from "../../context/UserContext";
import { QRCodeCanvas } from "qrcode.react";
import ResidentBusinessPayment from "./ResidentBusinessPayment";
import "../../styles/resident/resident-business-dashboard.css";

const ResidentBusinessDashboard = () => {
  const { userInfo: user } = useUser();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("inProgress");

  useEffect(() => {
    const fetchMyBusinesses = async () => {
      if (!user?.email) return;
      try {
        const q = query(collection(db, "businesses"), where("email", "==", user.email));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setBusinesses(data);
      } catch (error) {
        console.error("❌ Firebase fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMyBusinesses();
  }, [user]);

  const renderStatus = (b) => {
    const status = b.status || b.paymentStatus || "pending_evaluation";

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
        return (
          <div className="payment-section">
            <p>💳 Your application is ready for payment.</p>
            <ResidentBusinessPayment business={b} />
          </div>
        );
      case "payment_submitted":
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
          ({ key, label }) =>
            b[key] && (
              <p key={key}>
                <a href={b[key]} target="_blank" rel="noopener noreferrer">
                  📎 View {label}
                </a>
              </p>
            )
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
