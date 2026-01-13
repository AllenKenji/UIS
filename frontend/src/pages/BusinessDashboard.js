import React, { useEffect, useState } from 'react';
import './business-dashboard.css';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { QRCodeCanvas } from 'qrcode.react';
import BusinessEvaluationModal from '../components/staff/BusinessEvaluationModal';

const BusinessDashboard = () => {
  const [businesses, setBusinesses] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [showModal, setShowModal] = useState(false);

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

  const openModal = (business) => {
    setSelectedBusiness(business);
    setShowModal(true);
  };

  const handleEvaluationSubmit = async ({ status, notes }) => {
    try {
      const refDoc = doc(db, "businesses", selectedBusiness.id);
      await updateDoc(refDoc, {
        status,
        notes,
        evaluatedAt: new Date().toISOString(),
      });

      setShowModal(false);
      setSelectedBusiness(null);
      fetchBusinesses();
    } catch (err) {
      console.error("❌ Failed to update business:", err);
      alert("Failed to update business.");
    }
  };

  const filtered = filter
    ? businesses.filter(b => b.barangay === filter)
    : businesses;

  const barangayOptions = Array.from(
    new Set(businesses.map(b => b.barangay).filter(Boolean))
  ).sort();

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

      {loading ? (
        <p>Loading businesses...</p>
      ) : filtered.length === 0 ? (
        <p>No businesses found.</p>
      ) : (
        <div className="business-grid">
          {filtered.map(b => (
            <div key={b.businessId} className="business-card">
              <h3>{b.businessName}</h3>
              <p><strong>Owner:</strong> {b.ownerName}</p>
              <p><strong>Type:</strong> {b.businessType}</p>
              <p><strong>Barangay:</strong> {b.barangay}</p>
              <p><strong>Address:</strong> {b.address}</p>
              <p><strong>Contact:</strong> {b.contactNumber}</p>
              <p><strong>Status:</strong> {b.status || "pending_evaluation"}</p>

              {b.fileUrl && (
                <p>
                  <a href={b.fileUrl} target="_blank" rel="noopener noreferrer">
                    📎 View Document
                  </a>
                </p>
              )}

              <p className="business-id">ID: {b.businessId}</p>

              <div className="qr-wrapper">
                <QRCodeCanvas value={b.businessId} size={96} />
              </div>

              {/* ✅ Staff Action */}
              <button className="evaluate-btn" onClick={() => openModal(b)}>
                Evaluate
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ✅ Evaluation Modal */}
      {showModal && selectedBusiness && (
        <BusinessEvaluationModal
          business={selectedBusiness}
          onClose={() => setShowModal(false)}
          onSubmit={handleEvaluationSubmit}
        />
      )}
    </div>
  );
};

export default BusinessDashboard;
