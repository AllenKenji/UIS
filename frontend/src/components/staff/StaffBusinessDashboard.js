import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase";
import BusinessEvaluationModal from "./BusinessEvaluationModal";
import "../../styles/staff/staff-business-dashboard.css";

const StaffBusinessDashboard = () => {
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("needsEvaluation");
  const [selectedBusiness, setSelectedBusiness] = useState(null);

  // 🔄 Fetch all businesses
  useEffect(() => {
    const fetchBusinesses = async () => {
      try {
        const snapshot = await getDocs(collection(db, "businesses"));
        const data = snapshot.docs.map(doc => ({
          id: doc.id,          // Firestore doc ID
          ...doc.data()
        }));
        setBusinesses(data);
      } catch (error) {
        console.error("❌ Firebase fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchBusinesses();
  }, []);

  // 🧩 Separate businesses by status
  const needsEvaluation = businesses.filter(b =>
    ["pending_evaluation", "for_payment", "payment_submitted", "paid"].includes(b.status)
  );

  const evaluated = businesses.filter(b =>
    ["approved", "rejected"].includes(b.status)
  );

  // 🧩 Render business cards
  const renderBusinessCard = (b) => (
    <div key={b.id} className="business-card">
      <h3>{b.businessName}</h3>
      <p><strong>Owner:</strong> {b.ownerName}</p>
      <p><strong>Type:</strong> {b.businessType}</p>
      <p><strong>Barangay:</strong> {b.barangay}</p>
      <p><strong>Status:</strong> {b.status}</p>
      <button onClick={() => setSelectedBusiness(b)}>Evaluate</button>
    </div>
  );

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
        />
      )}
    </div>
  );
};

export default StaffBusinessDashboard;
