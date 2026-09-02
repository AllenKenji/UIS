// Mirrors backend/app/utils/barangay_documents.py's with_street_abbreviation /
// with_barangay_abbreviation, so addresses read the same everywhere: on
// screen and on printed documents.

const STREET_SUFFIXES = new Set([
  "st", "st.", "street", "ave", "ave.", "avenue", "blvd", "blvd.", "boulevard",
  "rd", "rd.", "road", "highway", "hwy", "hwy.",
]);

export function withStreetAbbreviation(street) {
  const trimmed = (street || "").trim();
  if (!trimmed) return trimmed;
  const words = trimmed.replace(/\.$/, "").split(" ");
  const lastWord = words[words.length - 1].toLowerCase();
  if (STREET_SUFFIXES.has(lastWord)) return trimmed;
  return `${trimmed} St.`;
}

export function withBarangayAbbreviation(barangay) {
  const trimmed = (barangay || "").trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("brgy") || lower.startsWith("barangay")) return trimmed;
  return `Brgy. ${trimmed}`;
}

/** Joins the common address fields into one display string, abbreviated. */
export function formatAddress(address, { includeProvince = false } = {}) {
  if (!address) return "";
  const parts = [
    address.houseNumber,
    address.street ? withStreetAbbreviation(address.street) : null,
    address.barangay ? withBarangayAbbreviation(address.barangay) : null,
    address.city,
    includeProvince ? address.province : null,
  ];
  return parts.filter(Boolean).join(", ");
}
