import { useState, useMemo, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { ResidentsAPI, API_BASE_URL } from '../../services/api';
import { formatAddress } from '../../utils/addressFormat';
import { toast } from 'react-toastify';
import './resident-list.css';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];
const DEFAULT_AVATAR = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

// Resident uploads (photo, government ID, signature, fingerprints) are saved
// via the public registration flow and come back as backend-relative paths
// (e.g. "/storage/residents/..."), not full URLs — resolve those against the
// API host so they don't get requested against the frontend's own origin.
const resolveFileUrl = (url) => (url?.startsWith('/') ? `${API_BASE_URL}${url}` : url);

const VERIFICATION_LABELS = {
  verified: { label: '✅ Verified', className: 'verification-badge verified' },
  pending: { label: '⏳ Pending Verification', className: 'verification-badge pending' },
  rejected: { label: '❌ Rejected', className: 'verification-badge rejected' },
};

const verificationInfo = (status) => VERIFICATION_LABELS[status] || VERIFICATION_LABELS.verified;

const ResidentList = ({ residents, loading, onResidentDeleted, fetchResidents }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [barangayFilter, setBarangayFilter] = useState('');
  const [voterFilter, setVoterFilter] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('');
  const [selectedResident, setSelectedResident] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [verifying, setVerifying] = useState(false);

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
      const matchesVerification = verificationFilter
        ? (r.verificationStatus || 'verified') === verificationFilter
        : true;
      return matchesSearch && matchesBarangay && matchesVoter && matchesVerification;
    });
  }, [residentArray, searchTerm, barangayFilter, voterFilter, verificationFilter]);

  const pendingCount = useMemo(
    () => residentArray.filter((r) => r.verificationStatus === 'pending').length,
    [residentArray]
  );

  // ✅ Verify / reject a resident's self-registration
  const handleVerify = async (resident, verificationStatus) => {
    setVerifying(true);
    try {
      await ResidentsAPI.verify(resident.id, verificationStatus, verificationStatus === 'rejected' ? rejectionNotes : undefined);
      toast.success(verificationStatus === 'verified' ? '✅ Resident verified' : '❌ Registration rejected');
      setSelectedResident(null);
      setRejectionNotes('');
      fetchResidents?.();
    } catch (err) {
      console.error('❌ Error updating verification:', err);
      toast.error('❌ Failed to update verification status');
    } finally {
      setVerifying(false);
    }
  };

  // 📤 CSV Export
  const exportToCSV = () => {
    const headers = ['Full Name', 'Birth Date', 'Gender', 'Contact', 'Address', 'Occupation'];
    const rows = filteredResidents.map((r) => [
      r.fullName || '',
      r.birthDate || '',
      r.gender || '',
      r.contactNumber || '',
      formatAddress(r.address),
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
        <select value={verificationFilter} onChange={(e) => setVerificationFilter(e.target.value)}>
          <option value="">All Verification Status</option>
          <option value="pending">⏳ Pending Verification</option>
          <option value="verified">✅ Verified</option>
          <option value="rejected">❌ Rejected</option>
        </select>
        <button onClick={exportToCSV}>📤 Export CSV</button>
      </div>

      {pendingCount > 0 && (
        <p className="pending-verification-banner">
          ⏳ {pendingCount} resident{pendingCount > 1 ? 's are' : ' is'} awaiting verification —{' '}
          <button type="button" onClick={() => setVerificationFilter('pending')}>view pending</button>
        </p>
      )}

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
              src={r.photoUrl ? resolveFileUrl(r.photoUrl) : DEFAULT_AVATAR}
              alt={`${r.fullName || 'Unnamed'}'s ID`}
              className="resident-photo"
            />
            <span className={verificationInfo(r.verificationStatus).className}>
              {verificationInfo(r.verificationStatus).label}
            </span>
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
                src={selectedResident.photoUrl ? resolveFileUrl(selectedResident.photoUrl) : DEFAULT_AVATAR}
                alt="Resident ID"
                className="resident-photo-large"
              />
            </div>

            <div className="details-section">
              <p><strong>Full Name:</strong> {selectedResident.fullName}</p>
              <p><strong>Birth Date:</strong> {selectedResident.birthDate}</p>
              <p><strong>Gender:</strong> {selectedResident.gender}</p>
              <p><strong>Contact:</strong> {selectedResident.contactNumber}</p>
              <p><strong>Address:</strong> {formatAddress(selectedResident.address)}</p>
              <p><strong>Occupation:</strong> {selectedResident.occupation}</p>
              <p><strong>Voter Status:</strong> {selectedResident.voterStatus}</p>
              <p>
                <strong>Verification:</strong>{' '}
                <span className={verificationInfo(selectedResident.verificationStatus).className}>
                  {verificationInfo(selectedResident.verificationStatus).label}
                </span>
              </p>
              {selectedResident.verificationNotes && (
                <p><strong>Verification Notes:</strong> {selectedResident.verificationNotes}</p>
              )}
            </div>

            {/* ✏️ Resident-requested information update, awaiting review */}
            {selectedResident.updateRequestRemarks && (
              <div className="id-document-section">
                <p><strong>✏️ Requested Information Update:</strong></p>
                <p>{selectedResident.updateRequestRemarks}</p>
                {selectedResident.updateRequestDocumentUrl && (
                  <a href={resolveFileUrl(selectedResident.updateRequestDocumentUrl)} target="_blank" rel="noopener noreferrer">
                    📎 View supporting document
                  </a>
                )}
              </div>
            )}

            {/* 🪪 Government ID / proof of identification */}
            <div className="id-document-section">
              <p><strong>Government ID / Proof of Identification:</strong></p>
              {selectedResident.idDocumentUrl ? (
                <a href={resolveFileUrl(selectedResident.idDocumentUrl)} target="_blank" rel="noopener noreferrer">
                  <img
                    src={resolveFileUrl(selectedResident.idDocumentUrl)}
                    alt="Submitted ID"
                    className="resident-photo-large"
                  />
                </a>
              ) : (
                <p>No ID document uploaded (registered by staff).</p>
              )}
            </div>

            {/* ✅ Verify / reject a pending self-registration */}
            {(selectedResident.verificationStatus || 'verified') === 'pending' && (
              <div className="verification-actions">
                <p><strong>Verify this registration:</strong></p>
                <textarea
                  placeholder="Rejection reason (optional, shown if rejecting)"
                  value={rejectionNotes}
                  onChange={(e) => setRejectionNotes(e.target.value)}
                  rows={2}
                />
                <div className="popup-actions">
                  <button className="confirm-btn" disabled={verifying} onClick={() => handleVerify(selectedResident, 'verified')}>
                    ✅ Verify
                  </button>
                  <button className="cancel-btn" disabled={verifying} onClick={() => handleVerify(selectedResident, 'rejected')}>
                    ❌ Reject
                  </button>
                </div>
              </div>
            )}

            {/* Fingerprint boxes */}
            <div className="fingerprint-section">
              <div className="finger-box">
                <p>Left Thumb</p>
                {selectedResident.fingerprints?.left ? (
                  <img
                    src={resolveFileUrl(selectedResident.fingerprints.left)}
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
                    src={resolveFileUrl(selectedResident.fingerprints.right)}
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
                  src={resolveFileUrl(selectedResident.signatureUrl)}
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
