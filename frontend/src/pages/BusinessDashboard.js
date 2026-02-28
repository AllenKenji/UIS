import { useEffect, useState } from 'react';
import './business-dashboard.css';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, deleteObject } from "firebase/storage";
import { db } from '../services/firebase';
import BusinessEvaluationModal from '../components/staff/BusinessEvaluationModal';

const BusinessDashboard = () => {
  const [businesses, setBusinesses] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [activeTab, setActiveTab] = useState("needsEvaluation");

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

  const storage = getStorage();

  const deleteCollectionDocs = async (colName, field, value) => {
    const q = query(collection(db, colName), where(field, "==", value));
    const snapshot = await getDocs(q);
    for (const d of snapshot.docs) {
      await deleteDoc(doc(db, colName, d.id));
    }
  };

  const deleteStorageFiles = async (docs = {}) => {
    for (const [key, docInfo] of Object.entries(docs)) {
      if (docInfo?.path) {
        try {
          const fileRef = ref(storage, docInfo.path);
          await deleteObject(fileRef);
          console.log(`🗑️ Deleted file: ${docInfo.path}`);
        } catch (err) {
          console.error(`⚠️ Failed to delete file: ${docInfo.path}`, err);
        }
      } else {
        console.warn(`⚠️ Document ${key} has no path, skipping storage deletion.`);
      }
    }
  };

  const handleDeleteBusiness = async (business) => {
    if (window.confirm(`Delete ${business.businessName}?`)) {
      try {
        await deleteDoc(doc(db, "businesses", business.id));
        await deleteCollectionDocs("payments", "businessId", business.businessId);
        await deleteCollectionDocs("receipts", "businessId", business.businessId);

        if (business.documents) {
          await deleteStorageFiles(business.documents);
        }

        fetchBusinesses();
      } catch (err) {
        console.error("❌ Failed to delete:", err);
        alert("Failed to delete business.");
      }
    }
  };

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
