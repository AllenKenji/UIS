import { useEffect, useState } from "react";
import { ResidentsAPI, ComplaintsAPI, api } from "../services/api";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../services/firebase";
import "./resident.css";

const DEFAULT_AVATAR = "/assets/default-avatar.png";

const toDate = (value) => {
  if (!value) return null;
  if (value?.toDate && typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleString() : "—";
};

// ✅ Age calculator
const calculateAge = (birthDate) => {
  if (!birthDate) return "—";
  const dob = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
};

// ✅ Normalize resident object (handles nested address + missing fields)
const normalizeResident = (resident) => {
  if (!resident) return null;

  const {
    address = {},
    fingerprints = {},
    signatureUrl,
    photoUrl,
    birthDate,
    ...rest
  } = resident;

  return {
    ...rest,
    birthDate,
    age: calculateAge(birthDate),
    photoUrl,
    signatureUrl,
    fingerprints,
    address: {
      houseNumber: address.house || "—",
      street: address.street || "—",
      purok: address.purok || "—",
      barangay: address.barangay || "—",
      city: address.city || "—",
      province: address.province || "—",
      zipCode: address.zipCode || "—",
    },
  };
};

const ResidentDashboard = ({ residentId }) => {
  const [resident, setResident] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [businesses, setBusinesses] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [complaints, setComplaints] = useState([]);

  // ✅ Always run hooks — no conditional before this
  useEffect(() => {
    const fetchResident = async () => {
      if (!residentId) {
        setLoading(false);
        return;
      }

      try {
        const data = await ResidentsAPI.getById(residentId);
        setResident(normalizeResident(data));
      } catch (err) {
        console.error("❌ Failed to load resident:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchResident();
  }, [residentId]);

  useEffect(() => {
    const fetchRecords = async () => {
      if (!residentId) {
        setRecordsLoading(false);
        return;
      }

      try {
        setRecordsLoading(true);

        const [byUidBusinesses, byEmailBusinesses, docsRes, complaintsRes, incidentsByResident, incidentsByAuth] = await Promise.all([
          getDocs(query(collection(db, "businesses"), where("ownerUid", "==", residentId))).catch(() => ({ docs: [] })),
          resident?.email
            ? getDocs(query(collection(db, "businesses"), where("email", "==", resident.email))).catch(() => ({ docs: [] }))
            : Promise.resolve({ docs: [] }),
          api.get("/api/documents/my", { params: { resident_id: residentId } }).catch(() => ({ data: [] })),
          ComplaintsAPI.listMine().catch(() => []),
          getDocs(query(collection(db, "incidents"), where("residentId", "==", residentId))).catch(() => ({ docs: [] })),
          getDocs(query(collection(db, "incidents"), where("authUid", "==", residentId))).catch(() => ({ docs: [] })),
        ]);

        const businessMap = {};
        [...(byUidBusinesses.docs || []), ...(byEmailBusinesses.docs || [])].forEach((docSnap) => {
          businessMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        setBusinesses(Object.values(businessMap));

        const normalizedDocuments = (Array.isArray(docsRes.data) ? docsRes.data : []).map((docItem) => ({
          id: docItem.id || docItem.documentId || docItem.document_id,
          documentType: docItem.documentType || docItem.document_type || "—",
          status: docItem.status || "—",
          createdAt: docItem.createdAt || docItem.created_at || null,
        }));
        setDocuments(normalizedDocuments);

        const incidentMap = {};
        [...(incidentsByResident.docs || []), ...(incidentsByAuth.docs || [])].forEach((docSnap) => {
          incidentMap[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
        });
        setIncidents(Object.values(incidentMap));

        setComplaints(Array.isArray(complaintsRes) ? complaintsRes : []);
      } catch (err) {
        console.error("❌ Failed to load resident records:", err);
        setBusinesses([]);
        setDocuments([]);
        setIncidents([]);
        setComplaints([]);
      } finally {
        setRecordsLoading(false);
      }
    };

    fetchRecords();
  }, [residentId, resident?.email]);

  // ✅ Safe conditional rendering AFTER hooks
  if (!residentId) return <p>Invalid resident ID.</p>;
  if (loading) return <p>Loading resident...</p>;
  if (!resident) return <p>Resident not found.</p>;

  const {
    fullName,
    occupation,
    photoUrl,
    birthDate,
    age,
    gender,
    civilStatus,
    contactNumber,
    email,
    isHeadOfFamily,
    voterStatus,
    fingerprints,
    signatureUrl,
    remarks,
    address,
  } = resident;

  return (
    <div className="resident-dashboard-page">
      <div className="resident-dashboard-actions">
        <button
          type="button"
          className="profile-toggle-btn"
          onClick={() => setShowProfile((prev) => !prev)}
        >
          {showProfile ? "Hide Profile" : "View Profile"}
        </button>
      </div>

      {showProfile && (
        <div className="resident-resume">
          <div className="resume-header">
            <img
              src={photoUrl || DEFAULT_AVATAR}
              alt={fullName || "Resident photo"}
              className="resume-photo"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = DEFAULT_AVATAR;
              }}
            />
            <div>
              <h1>{fullName}</h1>
              <p className="resume-occupation">{occupation || "—"}</p>
            </div>
          </div>

          <Section title="Personal Information">
            <Grid>
              <Item label="Birth Date" value={birthDate} />
              <Item label="Age" value={age} />
              <Item label="Gender" value={gender} />
              <Item label="Civil Status" value={civilStatus} />
              <Item label="Contact" value={contactNumber} />
              <Item label="Email" value={email || "—"} />
            </Grid>
          </Section>

          <Section title="Address">
            <Grid>
              <Item label="House No." value={address.houseNumber} />
              <Item label="Street" value={address.street} />
              <Item label="Purok" value={address.purok} />
              <Item label="Barangay" value={address.barangay} />
              <Item label="City" value={address.city} />
              <Item label="Province" value={address.province} />
              <Item label="Zip Code" value={address.zipCode} />
            </Grid>
          </Section>

          <Section title="Residency Details">
            <Grid>
              <Item label="Head of Family" value={isHeadOfFamily ? "Yes" : "No"} />
              <Item label="Voter Status" value={voterStatus} />
            </Grid>
          </Section>

          <Section title="Biometrics">
            <div className="biometric-row">
              <BioItem label="Left Thumb" src={fingerprints.left} alt="Left thumbprint" />
              <BioItem label="Right Thumb" src={fingerprints.right} alt="Right thumbprint" />
              <BioItem label="Signature" src={signatureUrl} alt="Resident signature" className="signature-img" />
            </div>
          </Section>

          <Section title="Remarks">
            <p className="remarks-box">{remarks || "No remarks"}</p>
          </Section>
        </div>
      )}

      <div className="resident-records">
        <Section title="My Businesses">
          {recordsLoading ? (
            <p>Loading records...</p>
          ) : businesses.length === 0 ? (
            <p>No businesses found.</p>
          ) : (
            <SimpleTable
              headers={["Business Name", "Type", "Status", "Submitted"]}
              rows={businesses.map((item) => ([
                item.businessName || "—",
                item.businessType || "—",
                item.status || item.paymentStatus || "—",
                formatDateTime(item.submittedAt),
              ]))}
            />
          )}
        </Section>

        <Section title="My Documents">
          {recordsLoading ? (
            <p>Loading records...</p>
          ) : documents.length === 0 ? (
            <p>No documents found.</p>
          ) : (
            <SimpleTable
              headers={["Document Type", "Status", "Requested"]}
              rows={documents.map((item) => ([
                item.documentType || "—",
                item.status || "—",
                formatDateTime(item.createdAt),
              ]))}
            />
          )}
        </Section>

        <Section title="My Incident Reports">
          {recordsLoading ? (
            <p>Loading records...</p>
          ) : incidents.length === 0 ? (
            <p>No incidents found.</p>
          ) : (
            <SimpleTable
              headers={["Type", "Description", "Status", "Reported"]}
              rows={incidents.map((item) => ([
                item.type || "—",
                item.description || "—",
                item.status || "—",
                item.date && item.time ? `${item.date} ${item.time}` : formatDateTime(item.createdAt),
              ]))}
            />
          )}
        </Section>

        <Section title="My Complaints">
          {recordsLoading ? (
            <p>Loading records...</p>
          ) : complaints.length === 0 ? (
            <p>No complaints found.</p>
          ) : (
            <SimpleTable
              headers={["Category", "Description", "Location", "Status", "Filed"]}
              rows={complaints.map((item) => ([
                item.category || "—",
                item.description || "—",
                item.location || "—",
                item.status || "—",
                formatDateTime(item.timestamp),
              ]))}
            />
          )}
        </Section>
      </div>
    </div>
  );
};

export default ResidentDashboard;

/* -------------------------
   ✅ Reusable Components
-------------------------- */

const Section = ({ title, children }) => (
  <section>
    <h2>{title}</h2>
    {children}
  </section>
);

const Grid = ({ children }) => (
  <div className="resume-grid">{children}</div>
);

const Item = ({ label, value }) => (
  <div>
    <strong>{label}:</strong> {value || "—"}
  </div>
);

const BioItem = ({ label, src, alt, className = "fingerprint-img" }) => (
  <div>
    <p><strong>{label}</strong></p>
    {src ? <img src={src} alt={alt} className={className} /> : "No image"}
  </div>
);

const SimpleTable = ({ headers, rows }) => (
  <div className="resident-table-wrap">
    <table className="resident-table">
      <thead>
        <tr>
          {headers.map((head) => (
            <th key={head}>{head}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            {row.map((cell, cellIndex) => (
              <td key={`${index}-${cellIndex}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
