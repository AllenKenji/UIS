// resolveLocation.js
export function resolveLocation(documentType, formData, residents = [], businesses = []) {
  let location = {
    barangay: "",
    street: "",
    city: "",
    province: "",
    address: ""
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
      if (business) {
        location = {
          barangay: business.barangay || "",
          street: business.street || "",
          city: business.city || "",
          province: business.province || ""
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

  // ✅ Always build a clean address string 
  const parts = [ 
    location.street, 
    location.barangay ? `Brgy. ${location.barangay}` : "", 
    location.city, 
    location.province 
  ].filter(Boolean); 

  location.address = parts.join(", ");

  return location;
}
