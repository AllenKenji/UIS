// helpers/validation.js

// Individual validators
const validateCategory = (category) => {
  if (!category) return "Category is required.";
  const allowed = ["Noise", "Service", "Neighbor", "Other"];
  if (!allowed.includes(category)) return "Invalid category.";
  return null;
};

const validateDescription = (description) => {
  if (!description || description.trim().length < 5) {
    return "Description must be at least 5 characters.";
  }
  return null;
};

const validateLocation = (location) => {
  if (!location) return "Location is required.";
  return null;
};

const validateResidentUid = (uid) => {
  if (!uid) return "Resident UID is required.";
  if (typeof uid !== "string") return "Resident UID must be a string.";
  if (!/^[A-Za-z0-9]+$/.test(uid)) return "Resident UID must be alphanumeric.";
  if (uid.length < 20 || uid.length > 40) {
    return "Resident UID length looks invalid.";
  }
  return null;
};

// Main payload validator
export const validateComplaintPayload = (payload) => {
  const errors = [];

  const categoryError = validateCategory(payload.category);
  if (categoryError) errors.push(categoryError);

  const descriptionError = validateDescription(payload.description);
  if (descriptionError) errors.push(descriptionError);

  const locationError = validateLocation(payload.location);
  if (locationError) errors.push(locationError);

  const uidError = validateResidentUid(payload.filed_by);
  if (uidError) errors.push(uidError);

  return errors;
};
