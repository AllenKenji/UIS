import React, { useEffect, useState } from 'react';
import './business-dashboard.css';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import BusinessEvaluationModal from '../components/staff/BusinessEvaluationModal';

const BusinessDashboard = () => {
  const [businesses, setBusinesses] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [activeTab, setActiveTab] = useState("needsEvaluation"); // 🔧 tab state

  // 🔄 Fetch businesses
  const fetchBusinesses = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'businesses'));
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBusinesses(data);
    } catch (error) {
      console.error('❌ Firebase fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusinesses();
  }, []);

  const handleEvaluationSubmit = async ({ status, notes }) => {
    try {
      const refDoc = doc(db, "businesses", selectedBusiness.id);
      await updateDoc(refDoc, {
        status,
        notes,
        evaluatedAt: new Date().toISOString(),
      });
      setSelectedBusiness(null);
      fetchBusinesses();
    } catch (err) {
      console.error("❌ Failed to update business:", err);
      alert("Failed to update business.");
    }
  };

  // 🔎 Separate approved from others
  const approvedBusinesses = businesses.filter(b => b.status === "approved");
  const otherBusinesses = businesses.filter(b => b.status !== "approved");

  // 🔎 Apply barangay filter
  const applyFilter = (list) =>
    filter ? list.filter(b => b.barangay === filter) : list;

  const barangayOptions = Array.from(
    new Set(businesses.map(b => b.barangay).filter(Boolean))
  ).sort();

  // 🔧 Choose which list to show based on activeTab
  const listToRender =
    activeTab === "needsEvaluation"
      ? applyFilter(otherBusinesses)
      : applyFilter(approvedBusinesses);

  return (
    <div className="business-dashboard">
      <h2>📊 Business Registry</h2>

      <div className="filters">
        <label htmlFor="barangay-filter">Filter by Barangay:</label>
        <select
          id="barangay-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All Barangays</option>
          {barangayOptions.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={activeTab === "needsEvaluation" ? "active" : ""}
          onClick={() => setActiveTab("needsEvaluation")}
        >
          🕑 Needs Evaluation
        </button>
        <button
          className={activeTab === "approved" ? "active" : ""}
          onClick={() => setActiveTab("approved")}
        >
          ✅ Approved Businesses
        </button>
      </div>

      {loading ? (
        <p>Loading businesses...</p>
      ) : listToRender.length === 0 ? (
        <p>No businesses found in this tab.</p>
      ) : (
        <table className="business-table">
          <thead>
            <tr>
              <th>Business Owner</th>
              <th>Business Name</th>
            </tr>
          </thead>
          <tbody>
            {listToRender.map(b => (
              <tr
                key={b.id}
                className="clickable-row"
                onClick={() => setSelectedBusiness(b)}
              >
                <td>{b.ownerName}</td>
                <td>{b.businessName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ✅ Evaluation Modal */}
      {selectedBusiness && (
        <BusinessEvaluationModal
          business={selectedBusiness}
          onClose={() => setSelectedBusiness(null)}
          onSubmit={handleEvaluationSubmit}
        />
      )}
    </div>
  );
};

export default BusinessDashboard;
