import { useEffect, useState } from 'react';
import './business-dashboard.css';
import { BusinessesAPI, NotificationsAPI } from '../services/api';
import { useNavigate } from 'react-router-dom';
import BusinessEvaluationModal from '../components/staff/BusinessEvaluationModal';

const BusinessDashboard = () => {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [activeTab, setActiveTab] = useState("needsEvaluation");

  const fetchBusinesses = async () => {
    try {
      const data = await BusinessesAPI.listAll();
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
      await BusinessesAPI.update(selectedBusiness.id, { status, notes, evaluatedAt: new Date().toISOString() });

      await NotificationsAPI.createBusinessStatusUpdate(
        status,
        selectedBusiness?.ownerUid || null,
        selectedBusiness?.businessName,
        selectedBusiness?.businessId,
        selectedBusiness?.id
      );

      setSelectedBusiness(null);
      fetchBusinesses();
    } catch (err) {
      console.error("❌ Failed to update business:", err);
      alert("Failed to update business.");
    }
  };

  const approvedBusinesses = businesses.filter(b => b.status === "approved");
  const otherBusinesses = businesses.filter(b => b.status !== "approved");

  const applyFilter = (list) =>
    filter ? list.filter(b => b.barangay === filter) : list;

  const barangayOptions = Array.from(
    new Set(businesses.map(b => b.barangay).filter(Boolean))
  ).sort();

  const listToRender =
    activeTab === "needsEvaluation"
      ? applyFilter(otherBusinesses)
      : applyFilter(approvedBusinesses);

  const handleDeleteBusiness = async (business) => {
    if (window.confirm(`Delete ${business.businessName}?`)) {
      try {
        await BusinessesAPI.delete(business.id || business.businessId);

        fetchBusinesses();
      } catch (err) {
        console.error("❌ Failed to delete:", err);
        alert("Failed to delete business.");
      }
    }
  };

  return (
    <div className="business-dashboard">
      <div className="business-dashboard-header">
        <h2>📊 Business Registry</h2>
        <button
          type="button"
          className="register-business-btn"
          onClick={() => navigate('/residentBusinesses')}
        >
          Register Business
        </button>
      </div>

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
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {listToRender.map(b => (
              <tr key={b.id} className="clickable-row">
                <td onClick={() => setSelectedBusiness(b)}>{b.ownerName}</td>
                <td onClick={() => setSelectedBusiness(b)}>{b.businessName}</td>
                <td>{b.status}</td>
                <td>
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBusiness(b);
                    }}
                  >
                    🗑️ Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

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
