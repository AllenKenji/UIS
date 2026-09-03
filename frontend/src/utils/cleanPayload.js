import { PARANAQUE } from "../data/locations";

const LEGACY_BARANGAY_ALIASES = {
  "Sto. Niño": "Santo Niño",
};

const normalizeBarangay = (value) => {
  const trimmed = (value || "").trim();
  const normalized = LEGACY_BARANGAY_ALIASES[trimmed] || trimmed;
  // No longer gated on the static PARANAQUE.barangays list — this value
  // always comes from the resident form's read-only Barangay field, which
  // is itself resolved from the actual tenant record (see ResidentForm's
  // getTenant() call), not free text. Rejecting anything outside the old
  // hardcoded 16-barangay array silently nulled out the address for any
  // barangay registered after that list was written.
  return normalized || null;
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
      // ResidentForm already resolves these from the resident's actual
      // tenant record (see its getTenant() call) and submits them as
      // city/province — trust that instead of force-overwriting with the
      // single hardcoded PARANAQUE city/province, which silently mislabeled
      // every resident registered under a barangay in a different city.
      city: city || PARANAQUE.city,
      province: province || PARANAQUE.province,
      zipCode: zipCode || null,
    },
    isHeadOfFamily: data.isHeadOfFamily === "true",
    remarks: data.remarks?.trim() || null,
    email: data.email || null,
    occupation: data.occupation || null,
  };
};
