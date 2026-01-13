import React, { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase";
import { useUser } from "../../context/UserContext";
import { QRCodeCanvas } from "qrcode.react";
import "../../styles/resident/resident-business-dashboard.css";

const ResidentBusinessDashboard = () => {
  const { userInfo: user } = useUser();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);

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

  // 🔗 Payment handler
  const handlePayment = async (businessId, checkoutUrl) => {
    try {
      // If checkoutUrl already exists in Firestore, use it directly
      if (checkoutUrl) {
        window.open(checkoutUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const res = await fetch("/api/paymongo/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId,
          amount: 100, // replace with actual fee
          remarks: "Business registration fee",
        }),
      });

      if (!res.ok) throw new Error(`Failed to create payment link: ${res.statusText}`);

      const { checkout_url } = await res.json();
      window.open(checkout_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("❌ Payment error:", err);
      alert("Failed to initiate payment. Please try again.");
    }
  };

  // 🧩 Render status message
  const renderStatus = (b) => {
    const status = b.status || b.paymentStatus || "pending_evaluation";
    switch (status) {
      case "pending_evaluation":
        return <p className="pending-text">⏳ Application submitted. Awaiting staff evaluation.</p>;
      case "for_payment":
        return (
          <div className="payment-section">
            <p>💳 Your application is ready for payment.</p>
            <button className="pay-btn" onClick={() => handlePayment(b.businessId, b.checkoutUrl)}>
              Proceed to Payment
            </button>
          </div>
        );
      case "payment_submitted":
        return <p className="info-text">⏳ Payment submitted. Awaiting staff verification.</p>;
      case "approved":
        return (
          <div className="qr-wrapper">
            <p>✅ Approved — Permit Number: {b.permitNumber}</p>
            <QRCodeCanvas value={b.businessId} size={96} />
          </div>
        );
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

  // 🧩 Render documents
  const renderDocuments = (b) => (
    <div className="documents-list">
      {b.validId && (
        <p>
          <a href={b.validId} target="_blank" rel="noopener noreferrer">📎 View Valid ID</a>
        </p>
      )}
      {b.proofOfAddress && (
        <p>
          <a href={b.proofOfAddress} target="_blank" rel="noopener noreferrer">📎 View Proof of Address</a>
        </p>
      )}
      {b.dtiCert && (
        <p>
          <a href={b.dtiCert} target="_blank" rel="noopener noreferrer">📎 View DTI Certificate</a>
        </p>
      )}
      {b.businessLogo && (
        <p>
          <a href={b.businessLogo} target="_blank" rel="noopener noreferrer">📎 View Business Logo</a>
        </p>
      )}
    </div>
  );

  return (
    <div className="resident-business-dashboard">
      <h2>🏢 My Business Applications</h2>

      {loading ? (
        <p>Loading your businesses...</p>
      ) : businesses.length === 0 ? (
        <p>You have not registered any businesses yet.</p>
      ) : (
        <div className="business-grid">
          {businesses.map((b) => (
            <div key={b.businessId} className="business-card">
              <h3>{b.businessName}</h3>
              <p><strong>Type:</strong> {b.businessType}</p>
              <p><strong>Barangay:</strong> {b.barangay}</p>
              <p><strong>Address:</strong> {b.address}</p>

              {renderDocuments(b)}
              {renderStatus(b)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ResidentBusinessDashboard;
