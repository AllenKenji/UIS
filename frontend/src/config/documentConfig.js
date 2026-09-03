// src/data/documentConfig.js
import { PARANAQUE } from "../data/locations";

const documentConfig = {
  "Barangay Clearance": {
    fields: [
      { name: "purpose", label: "Purpose", type: "text", required: true, minLength: 5 },
    ],
    attachments: [
      { name: "idAttachment", label: "Upload Valid ID", required: true },
      { name: "residencyAttachment", label: "Upload Proof of Residency", required: true },
    ],
  },
  "Resident Certificate": {
    fields: [
      { name: "yearsOfStay", label: "Years of Residency", type: "number", required: true, min: 1 },
    ],
    attachments: [
      { name: "idAttachment", label: "Upload Valid ID", required: true },
      { name: "residencyAttachment", label: "Upload Proof of Residency", required: true },
    ],
  },
  "Indigency Certificate": {
    fields: [
      { name: "remarks", label: "Reason / Remarks", type: "textarea", required: true, minLength: 5 },
    ],
    attachments: [
      { name: "idAttachment", label: "Upload Valid ID", required: true },
      { name: "residencyAttachment", label: "Upload Proof of Residency", required: true },
    ],
  },
  "Good Moral Certificate": {
    fields: [
      { name: "purpose", label: "Purpose (e.g. school/employment)", type: "text", required: true },
    ],
    attachments: [
      { name: "idAttachment", label: "Upload Valid ID", required: true },
    ],
  },
  "Business Clearance": {
    fields: [
      { name: "businessName", label: "Business Name", type: "select", required: true, options: [] }
    ],
    attachments: [
      { name: "businessPermit", label: "Upload Business Permit", required: true },
      { name: "idAttachment", label: "Upload Valid ID", required: true },
    ],
  },
  "Activity Permit": {
    fields: [
      { name: "activityName", label: "Activity Name", type: "text", required: true },
      {
        label: "Activity Location",
        type: "group",
        fields: [
          // options intentionally omitted — populated at render time from the
          // super admin's registered barangays for the current city (see
          // SecretaryDocumentForm / ResidentDocumentRequestForm), not this
          // static list, so it always matches what's actually registered.
          { name: "location.barangay", label: "Barangay", type: "select", required: true },
          { name: "location.street", label: "(Blk# / Lot#), Street", type: "text" },
          { name: "location.city", label: "City", type: "text", default: PARANAQUE.city, readOnly: true },
          { name: "location.province", label: "Province", type: "text", default: PARANAQUE.province, readOnly: true },
        ]
      },
      { name: "activityDate", label: "Activity Date", type: "date", required: true },
    ],
    attachments: [
      { name: "idAttachment", label: "Upload Valid ID", required: true },
      { name: "activityPlan", label: "Upload Activity Plan", required: true },
    ],
  },
  "Blotter Report": {
    fields: [
      { name: "complainant", label: "Complainant Name", type: "text", required: true, autoFill: true },
      { name: "respondent", label: "Respondent Name", type: "text", required: true },
      { name: "incident", label: "Incident Details", type: "textarea", required: true, minLength: 10 },
      {
        label: "Incident Location",
        type: "group",
        fields: [
          // options intentionally omitted — populated at render time from the
          // super admin's registered barangays for the current city (see
          // SecretaryDocumentForm / ResidentDocumentRequestForm), not this
          // static list, so it always matches what's actually registered.
          { name: "location.barangay", label: "Barangay", type: "select", required: true },
          { name: "location.street", label: "(Blk# / Lot#), Street", type: "text" },
          { name: "location.city", label: "City", type: "text", default: PARANAQUE.city , readOnly: true},
          { name: "location.province", label: "Province", type: "text", default: PARANAQUE.province , readOnly: true},
        ]
      }
    ],
    attachments: [
      { name: "idAttachment", label: "Upload Valid ID", required: true },
      { name: "residencyAttachment", label: "Upload Proof of Residency", required: true },
    ],
  },
  "Health Certificate": {
    fields: [
      { name: "purpose", label: "Purpose of Certificate", type: "text", required: true },
    ],
    attachments: [
      { name: "medicalAttachment", label: "Upload Medical Result", required: true },
      { name: "idAttachment", label: "Upload Valid ID", required: true },
    ],
  },
  "Barangay ID": {
    fields: [
      { name: "occupation", label: "Occupation", type: "text", required: true },
      { name: "voterStatus", label: "Voter Status", type: "text", required: true },
    ],
    attachments: [
      { name: "photoAttachment", label: "Upload 1x1 Photo", required: true },
      { name: "idAttachment", label: "Upload Valid ID", required: true },
    ],
  },
};

export default documentConfig;
