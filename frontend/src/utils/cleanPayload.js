import { PARANAQUE } from "../data/locations";

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
      barangay: barangay || null,
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
