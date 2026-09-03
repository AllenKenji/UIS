import { useEffect, useState } from "react";
import { BusinessesAPI } from "../../services/api";
import BusinessEvaluationModal from "./BusinessEvaluationModal";
import "../../styles/staff/staff-business-dashboard.css";

const getEffectiveStatus = (business) => {
  const status = String(business?.status || "").toLowerCase();
  const paymentStatus = String(business?.paymentStatus || "").toLowerCase();
  // Terminal states take priority over payment status — otherwise an
  // approved-and-paid business (the normal end state) never lands in the
  // "Evaluated" tab and never shows its permit number. Matches
  // BusinessEvaluationModal.jsx / ResidentBusinessDashboard.jsx.
  if (["approved", "expired", "rejected"].includes(status)) return status;
  if (paymentStatus === "paid" || paymentStatus === "succeeded") return "paid";
  return status || "pending_evaluation";
};

const StaffBusinessDashboard = () => {
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("needsEvaluation");
  const [selectedBusiness, setSelectedBusiness] = useState(null);

  // 🔄 Fetch all businesses
  const fetchBusinesses = () => {
    setLoading(true);
    BusinessesAPI.listAll()
      .then((data) => setBusinesses(Array.isArray(data) ? data : []))
      .catch((error) => console.error("Failed to load businesses:", error))
      .finally(() => setLoading(false));
  };

  useEffect(fetchBusinesses, []);

  // 🧩 Separate businesses by status
  const needsEvaluation = businesses.filter(b =>
    ["pending_evaluation", "for_payment", "payment_submitted", "awaiting_payment", "paid"].includes(getEffectiveStatus(b))
  );

  const evaluated = businesses.filter(b =>
    ["approved", "expired", "rejected"].includes(getEffectiveStatus(b))
  );

  // 🧩 Render business cards
  const renderBusinessCard = (b) => {
    const effectiveStatus = getEffectiveStatus(b);
    return (
      <div key={b.id} className="business-card">
        <h3>{b.businessName}</h3>
        <p><strong>Owner:</strong> {b.ownerName}</p>
        <p><strong>Type:</strong> {b.businessType}</p>
        <p><strong>Barangay:</strong> {b.barangay}</p>
        <p><strong>Status:</strong> {effectiveStatus}</p>
        {effectiveStatus === "approved" && (
          <p><strong>Permit Number:</strong> {b.permitNumber || "—"}</p>
        )}
        <button onClick={() => setSelectedBusiness({ ...b, status: effectiveStatus })}>Evaluate</button>
      </div>
    );
  };

  return (
    <div className="staff-business-dashboard">
      <h2>📋 Business Applications</h2>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={activeTab === "needsEvaluation" ? "active" : ""}
          onClick={() => setActiveTab("needsEvaluation")}
        >
          Needs Evaluation
        </button>
        <button
          className={activeTab === "evaluated" ? "active" : ""}
          onClick={() => setActiveTab("evaluated")}
        >
          Evaluated
        </button>
      </div>

      {/* Business lists */}
      {loading ? (
        <p>Loading businesses...</p>
      ) : (
        <div className="business-grid">
          {activeTab === "needsEvaluation"
            ? needsEvaluation.map(renderBusinessCard)
            : evaluated.map(renderBusinessCard)}
        </div>
      )}

      {/* Evaluation Modal */}
      {selectedBusiness && (
        <BusinessEvaluationModal
          business={selectedBusiness}
          onClose={() => setSelectedBusiness(null)}
          onUpdated={fetchBusinesses}
        />
      )}
    </div>
  );
};

export default StaffBusinessDashboard;
