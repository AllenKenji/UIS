import React, { useEffect, useState } from "react";
import { ResidentsAPI } from "../services/api";
import "./resident.css";

const DEFAULT_AVATAR = "/assets/default-avatar.png";

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
    <div className="resident-resume">
      {/* ✅ Header */}
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

      {/* ✅ Personal Info */}
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

      {/* ✅ Address */}
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

      {/* ✅ Residency */}
      <Section title="Residency Details">
        <Grid>
          <Item label="Head of Family" value={isHeadOfFamily ? "Yes" : "No"} />
          <Item label="Voter Status" value={voterStatus} />
        </Grid>
      </Section>

      {/* ✅ Biometrics */}
      <Section title="Biometrics">
        <div className="biometric-row">
          <BioItem label="Left Thumb" src={fingerprints.left} alt="Left thumbprint" />
          <BioItem label="Right Thumb" src={fingerprints.right} alt="Right thumbprint" />
          <BioItem label="Signature" src={signatureUrl} alt="Resident signature" className="signature-img" />
        </div>
      </Section>

      {/* ✅ Remarks */}
      <Section title="Remarks">
        <p className="remarks-box">{remarks || "No remarks"}</p>
      </Section>
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
