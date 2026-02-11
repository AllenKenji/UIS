// resolveLocation.js
export function resolveLocation(documentType, formData, residents = [], businesses = []) {
  let location = {
    barangay: "",
    street: "",
    city: "",
    province: ""
  };

  switch (documentType) {
    case "Barangay Clearance": {
      const resident = residents.find(r => r.id === formData.resident_id);
      if (resident?.address) {
        location = {
          barangay: resident.address.barangay || "",
          street: resident.address.street || "",
          city: resident.address.city || "",
          province: resident.address.province || ""
        };
      }
      break;
    }

    case "Business Clearance": {
      const business = businesses.find(b => b.businessName === formData.businessName);
      if (business?.address) {
        location = {
          barangay: business.address.barangay || "",
          street: business.address.street || "",
          city: business.address.city || "",
          province: business.address.province || ""
        };
      }
      break;
    }

    default: {
      // Activity Permit, Blotter Report, etc.
      location = {
        barangay: formData["location.barangay"] || "",
        street: formData["location.street"] || "",
        city: formData["location.city"] || "",
        province: formData["location.province"] || ""
      };
    }
  }

  return location;
}
