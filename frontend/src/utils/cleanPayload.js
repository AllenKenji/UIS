import { PARANAQUE } from "../data/locations";

const LEGACY_BARANGAY_ALIASES = {
  "Sto. Niño": "Santo Niño",
};

const normalizeBarangay = (value) => {
  const trimmed = (value || "").trim();
  const normalized = LEGACY_BARANGAY_ALIASES[trimmed] || trimmed;
  return PARANAQUE.barangays.includes(normalized) ? normalized : null;
};

/**
 * Normalize and sanitize resident form data before submission.
 * - Removes forbidden top-level fields (city, province, etc.)
 * - Converts empty strings to null
 * - Trims remarks
 * - Ensures booleans/enums are clean
 * - Normalizes fingerprint structure
 */
export const cleanPayload = (data, uploads = {}) => {
  const {
    houseNumber,
    street,
    purok,
    barangay,
    city,     // stripped out
    province, // stripped out
    zipCode,
    ...rest
  } = data;

  return {
    ...rest,
    photoUrl: uploads.photoUrl || null,
    signatureUrl: uploads.signatureUrl || null,
    fingerprints: {
      left: uploads.fingerprints?.left || null,
      right: uploads.fingerprints?.right || null,
    },
    address: {
      houseNumber: houseNumber || null,
      street: street || null,
      purok: purok || null,
      barangay: normalizeBarangay(barangay),
      city: PARANAQUE.city,
      province: PARANAQUE.province,
      zipCode: zipCode || null,
    },
    isHeadOfFamily: data.isHeadOfFamily === "true",
    remarks: data.remarks?.trim() || null,
    email: data.email || null,
    occupation: data.occupation || null,
  };
};
