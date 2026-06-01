import { useState, useMemo, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { ResidentsAPI } from '../../services/api';
import { toast } from 'react-toastify';
import './resident-list.css';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];
const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

const ResidentList = ({ residents, loading, onResidentDeleted, fetchResidents }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [barangayFilter, setBarangayFilter] = useState('');
  const [voterFilter, setVoterFilter] = useState('');
  const [selectedResident, setSelectedResident] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // 🔄 Auto refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchResidents?.();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchResidents]);

  // 🧠 Normalize resident input
  const residentArray = useMemo(() => {
    if (Array.isArray(residents)) return residents;
    if (Array.isArray(residents?.results)) return residents.results;
    return [];
  }, [residents]);

  // 🧮 Barangay summary
  const barangayCounts = useMemo(() => {
    return residentArray.reduce((acc, r) => {
      const barangay = r.address?.barangay;
      if (barangay) acc[barangay] = (acc[barangay] || 0) + 1;
      return acc;
    }, {});
  }, [residentArray]);

  const chartData = useMemo(
    () => Object.entries(barangayCounts).map(([barangay, count]) => ({ name: barangay, value: count })),
    [barangayCounts]
  );

  const barangayOptions = useMemo(
    () => Array.from(new Set(residentArray.map((r) => r.address?.barangay).filter(Boolean))).sort(),
    [residentArray]
  );

  // 🔍 Filtered residents
  const filteredResidents = useMemo(() => {
    return residentArray.filter((r) => {
      const name = r.fullName?.toLowerCase() || '';
      const matchesSearch = name.includes(searchTerm.toLowerCase());
      const matchesBarangay = barangayFilter ? r.address?.barangay === barangayFilter : true;
      const matchesVoter = voterFilter ? r.voterStatus === voterFilter : true;
      return matchesSearch && matchesBarangay && matchesVoter;
    });
  }, [residentArray, searchTerm, barangayFilter, voterFilter]);

  // 📤 CSV Export
  const exportToCSV = () => {
    const headers = ['Full Name', 'Birth Date', 'Gender', 'Contact', 'Address', 'Occupation'];
    const rows = filteredResidents.map((r) => [
      r.fullName || '',
      r.birthDate || '',
      r.gender || '',
      r.contactNumber || '',
      `${r.address?.houseNumber || ''} ${r.address?.street || ''}, ${r.address?.barangay || ''}, ${r.address?.city || ''}`,
      r.occupation || '',
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'resident_registry.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 🗑️ Delete resident
  const confirmDelete = async () => {
    if (!confirmDeleteId) return;
    try {
      await ResidentsAPI.delete(confirmDeleteId);
      toast.success('Resident deleted successfully');
      setSelectedResident(null);
      onResidentDeleted?.(confirmDeleteId);
      fetchResidents?.(); // refresh immediately after delete
    } catch (err) {
      console.error('❌ Error deleting resident:', err);
      toast.error('❌ Failed to delete resident');
    } finally {
      setConfirmDeleteId(null);
    }
  };

  if (loading) return <p>Loading residents...</p>;
  if (residentArray.length === 0) return <p>No residents found.</p>;

  return (
    <div className="resident-list">
      <h2>Resident Directory</h2>
      <p><strong>Total Residents:</strong> {residentArray.length}</p>

      {/* 🔍 Filters */}
      <div className="filters">
        <input
          type="text"
          placeholder="Search by name"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select value={barangayFilter} onChange={(e) => setBarangayFilter(e.target.value)}>
          <option value="">All Barangays</option>
          {barangayOptions.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <select value={voterFilter} onChange={(e) => setVoterFilter(e.target.value)}>
          <option value="">All Voter Status</option>
          <option value="yes">Registered</option>
          <option value="no">Unregistered</option>
          <option value="unknown">Unknown</option>
        </select>
        <button onClick={exportToCSV}>📤 Export CSV</button>
      </div>

      {/* 📊 Barangay Summary */}
      <div className="barangay-summary">
        <h3>📊 Residents per Barangay</h3>
        <ul>
          {Object.entries(barangayCounts).map(([barangay, count]) => (
            <li key={barangay}>
              <strong>{barangay}:</strong> {count} resident{count > 1 ? 's' : ''}
            </li>
          ))}
        </ul>
      </div>

      {/* 📊 Pie Chart */}
      <PieChart width={400} height={300}>
        <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>

      {/* 🧑 Resident Cards */}
      <div className="resident-grid">
        {filteredResidents.map((r) => (
          <div key={r.id} className="resident-card">
            <img
              src={r.photoUrl || DEFAULT_AVATAR}
              alt={`${r.fullName || 'Unnamed'}'s ID`}
              className="resident-photo"
            />
            <button className="resident-name" onClick={() => setSelectedResident(r)}>
              {r.fullName || 'Unnamed'}
            </button>
            <button className="delete-btn" onClick={() => setConfirmDeleteId(r.id)}>🗑️ Delete</button>
          </div>
        ))}
      </div>

      {/* 🗑️ Confirmation Pop‑Up */}
      {confirmDeleteId && (
        <div className="popup-overlay">
          <div className="popup-window">
            <h3>Confirm Deletion</h3>
            <p>Are you sure you want to delete this resident?</p>
            <div className="popup-actions">
              <button className="confirm-btn" onClick={confirmDelete}>Yes, Delete</button>
              <button className="cancel-btn" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* 👤 Resident Details Pop‑Up */}
      {selectedResident && (
        <div className="popup-overlay">
          <div className="popup-window resident-details-popup">
            <button className="close-btn" onClick={() => setSelectedResident(null)}>✖</button>

            <div className="photo-section">
              <img
                src={selectedResident.photoUrl || DEFAULT_AVATAR}
                alt="Resident ID"
                className="resident-photo-large"
              />
            </div>

            <div className="details-section">
              <p><strong>Full Name:</strong> {selectedResident.fullName}</p>
              <p><strong>Birth Date:</strong> {selectedResident.birthDate}</p>
              <p><strong>Gender:</strong> {selectedResident.gender}</p>
              <p><strong>Contact:</strong> {selectedResident.contactNumber}</p>
              <p><strong>Address:</strong> {`${selectedResident.address?.houseNumber || ''} ${selectedResident.address?.street || ''}, ${selectedResident.address?.barangay || ''}, ${selectedResident.address?.city || ''}`}</p>
              <p><strong>Occupation:</strong> {selectedResident.occupation}</p>
                            <p><strong>Voter Status:</strong> {selectedResident.voterStatus}</p>
            </div>

            {/* Fingerprint boxes */}
            <div className="fingerprint-section">
              <div className="finger-box">
                <p>Left Thumb</p>
                {selectedResident.fingerprints?.left ? (
                  <img
                    src={selectedResident.fingerprints.left}
                    alt="Left Thumb"
                    className="fingerprint-img"
                  />
                ) : (
                  <p>No left thumb uploaded</p>
                )}
              </div>
              <div className="finger-box">
                <p>Right Thumb</p>
                {selectedResident.fingerprints?.right ? (
                  <img
                    src={selectedResident.fingerprints.right}
                    alt="Right Thumb"
                    className="fingerprint-img"
                  />
                ) : (
                  <p>No right thumb uploaded</p>
                )}
              </div>
            </div>

            {/* Signature */}
            <div className="signature-section">
              <p>Signature:</p>
              {selectedResident.signatureUrl ? (
                <img
                  src={selectedResident.signatureUrl}
                  alt="Signature"
                  className="signature-img"
                />
              ) : (
                <p>No signature uploaded</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResidentList;
