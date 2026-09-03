import { useState, useEffect } from "react";
import { api, endpoints, BusinessesAPI, PublicServicesAPI } from "../../services/api";
import { usePublicFees } from "../../hooks/usePublicFees";
import documentConfig from "../../config/documentConfig";
import { resolveLocation } from "../../utils/resolveLocation";
import { useNavigate } from "react-router-dom";
import "../../styles/resident/resident-document-form.css";
import { PARANAQUE } from "../../data/locations";

const ResidentDocumentRequestForm = ({ residentId = "", residentName = "", barangayId = "", onRequestSubmitted, redirectTo = "/ownDocuments", redirectState = null, showConfirmation = false }) => {
  const { documentTypes, loading, error } = usePublicFees(barangayId);
  const navigate = useNavigate();
  const [residentBusinesses, setResidentBusinesses] = useState([]);
  // Options for the Activity/Incident Location "Barangay" field — sourced
  // from the barangays actually registered under the super admin account
  // for this city, not a hardcoded list, so it can't drift out of date.
  const [barangayOptions, setBarangayOptions] = useState([]);

  const [formData, setFormData] = useState({
    resident_id: residentId,
    document_type: "",
    purpose: "",
    remarks: "",
    fee: 0,
    complainant: residentName || "",   // for Blotter Report autoFill
    businessName: "",                  // for Business Clearance select
    businessId: "",                    // links to the selected business's permit record
    "location.barangay": "",
    "location.street": "",
    "location.city": PARANAQUE.city,
    "location.province": PARANAQUE.province
  });


  const [attachments, setAttachments] = useState({});
  const [status, setStatus] = useState({ message: null, type: null });
  const [submittedDoc, setSubmittedDoc] = useState(null);

  useEffect(() => {
    // Resolve the current barangay's own "city" value first, rather than
    // assuming it matches the PARANAQUE.city constant exactly — the super
    // admin's "City" field on Barangays & Cities is free text, so a tenant
    // registered as e.g. "Paranaque" (no tilde) would never match a
    // hardcoded "Parañaque" and silently leave this dropdown empty.
    if (!barangayId) {
      setBarangayOptions([]);
      return;
    }
    let active = true;
    Promise.all([
      PublicServicesAPI.getTenant(barangayId),
      PublicServicesAPI.listTenants(),
    ])
      .then(([ownTenant, allTenants]) => {
        if (!active) return;
        const names = (Array.isArray(allTenants) ? allTenants : [])
          .filter((t) => t.city === ownTenant?.city)
          .map((t) => t.barangay)
          .filter(Boolean)
          .sort();
        setBarangayOptions(names);
      })
      .catch(() => active && setBarangayOptions([]));
    return () => { active = false; };
  }, [barangayId]);

  useEffect(() => {
    if (residentId) {
      // listByOwner requires a login — but this form is used by residents
      // who resolved their session through the public barangay portal and
      // never actually logged in (see PublicDocumentRequest.jsx), so that
      // call would 401 and silently leave this list empty. listMine is the
      // public/unauthenticated equivalent, scoped by residentId instead.
      BusinessesAPI.listMine(residentId)
        .then(data => setResidentBusinesses(data))
        .catch(err => console.error("❌ Failed to fetch resident businesses:", err));
    }
  }, [residentId]);


  useEffect(() => {
    if (documentTypes.length > 0) {
      const first = documentTypes[0];
      setFormData(prev => ({
        ...prev,
        document_type: first.documentType,
        fee: first.totalFee,
      }));
    }
  }, [documentTypes]);

  const handleChange = e => {
    const { name, value } = e.target;

    if (name === "document_type") {
      const selected = documentTypes.find(dt => dt.documentType === value);
      setFormData(prev => ({
        ...prev,
        document_type: value,
        fee: selected?.totalFee || 0,
        complainant: value === "Blotter Report" ? residentName || "" : prev.complainant
      }));
    } else if (name === "businessName") {
      const business = residentBusinesses.find(b => b.businessName === value);
      if (business) {
        setFormData(prev => ({
          ...prev,
          businessName: value,
          businessId: business.businessId || "",
          "location.street": business.street || "",
          "location.barangay": business.barangay || "",
          "location.city": business.city || "",
          "location.province": business.province || ""
        }));
      } else {
        setFormData(prev => ({ ...prev, businessName: value, businessId: "" }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };


  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    setAttachments(prev => ({ ...prev, [field]: file }));
  };

  // An approved business already has a verified record on file (it went
  // through staff evaluation) — its permit number gets cited on the
  // clearance automatically, so re-uploading a permit copy is redundant.
  // Anyone without a linked, approved business still needs to prove it.
  const hasApprovedBusinessLinked = () => {
    const business = residentBusinesses.find(b => b.businessName === formData.businessName);
    return Boolean(business) && String(business.status).toLowerCase() === "approved";
  };

  const validateForm = () => {
    const config = documentConfig[formData.document_type] || {};
    const rules = config.fields || [];
    const attachmentRules = config.attachments || [];

    for (const field of rules) {
      const value = formData[field.name];
      if (field.required && !value) return `${field.label} is required.`;
      if (field.minLength && value?.length < field.minLength)
        return `${field.label} must be at least ${field.minLength} characters.`;
      if (field.min !== undefined && Number(value) < field.min)
        return `${field.label} must be at least ${field.min}.`;
    }

    const skipBusinessPermitUpload =
      formData.document_type === "Business Clearance" && hasApprovedBusinessLinked();

    for (const att of attachmentRules) {
      if (att.name === "businessPermit" && skipBusinessPermitUpload) continue;
      const file = attachments[att.name];
      if (att.required && !file) return `${att.label} is required.`;
    }
 
    if (formData.document_type === "Business Clearance") {
      const loc = resolveLocation(formData.document_type, formData, [], residentBusinesses);
      if (!loc.address) {
        return "Business address is required.";
      }
    }

    return null;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const errorMsg = validateForm();
    if (errorMsg) {
      setStatus({ message: `❌ ${errorMsg}`, type: "error" });
      return;
    }

    setStatus({ message: "Submitting request...", type: "loading" });

    try {
      const payload = new FormData();
      Object.entries(formData).forEach(([key, value]) => payload.append(key, value));

      // 🔹 Normalize location fields
      const loc = resolveLocation(formData.document_type, formData, [], residentBusinesses);

      payload.append("locationBarangay", loc.barangay);
      payload.append("locationStreet", loc.street);
      payload.append("locationCity", loc.city);
      payload.append("locationProvince", loc.province);
      payload.append("address", loc.address); // ✅ backend requires this

      if (formData.document_type !== "Barangay Clearance") {
        if (loc.barangay) payload.append("locationBarangay", loc.barangay);
        if (loc.street) payload.append("locationStreet", loc.street);
        if (loc.city) payload.append("locationCity", loc.city);
        if (loc.province) payload.append("locationProvince", loc.province);

        const fullAddress = [loc.street, `Brgy. ${loc.barangay}`, loc.city, loc.province] 
          .filter(Boolean) 
          .join(", "); payload.append("address", fullAddress);
      }

      // 🔹 Attach files
      const attachmentRules = documentConfig[formData.document_type]?.attachments || [];
      attachmentRules.forEach(att => {
        if (attachments[att.name]) payload.append(att.name, attachments[att.name]);
      });

      const { data } = await api.post(endpoints.documents || "/documents", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setStatus({ message: "✅ Request submitted. Awaiting secretary validation.", type: "success" });
      onRequestSubmitted?.();

      // Reset form
      setFormData({
        resident_id: residentId,
        document_type: documentTypes.length > 0 ? documentTypes[0].documentType : "",
        purpose: "",
        remarks: "",
        fee: documentTypes.length > 0 ? documentTypes[0].totalFee : 0,
        complainant: residentName || "",
        businessName: "",
        businessId: "",
        "location.barangay": "",
        "location.street": "",
        "location.city": "",
        "location.province": ""
      });
      setAttachments({});

      if (showConfirmation) {
        // No account to log back into — give the resident something concrete to
        // hold onto instead of silently bouncing them back after a few seconds.
        setSubmittedDoc({ documentId: data?.documentId || data?.id, documentType: formData.document_type });
      } else {
        setTimeout(() => { navigate(redirectTo, redirectState ? { state: redirectState } : undefined); }, 1500); // 1500ms = 1.5 seconds
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message;
      console.error("❌ Error submitting request:", msg);
      setStatus({ message: "❌ Failed to submit request.", type: "error" });
    }
  };

  if (submittedDoc) {
    return (
      <div className="resident-document-form">
        <h2>✅ Request Submitted</h2>
        <p>Your <strong>{submittedDoc.documentType}</strong> request has been filed and is awaiting secretary validation.</p>
        {submittedDoc.documentId && (
          <p>
            Reference number: <strong>{submittedDoc.documentId}</strong>
            <br />
            <span className="status-message">Save this for your records.</span>
          </p>
        )}
        <p className="status-message">
          Come back anytime with your registered email or mobile number and birth date to check its status and pay
          once it's ready.
        </p>
        <button type="button" onClick={() => navigate(redirectTo, redirectState ? { state: redirectState } : undefined)}>Back to Barangay Services</button>
      </div>
    );
  }

  return (
    <div className="resident-document-form">
      <h2>📝 Request a Barangay Document</h2>

      {loading && <p>Loading document types...</p>}
      {error && <p className="status-message error">❌ {error}</p>}

      <form onSubmit={handleSubmit}>
        {/* Document type */}
        <div className="form-group">
          <label htmlFor="document_type">Document Type</label>
          <select
            name="document_type"
            value={formData.document_type}
            onChange={handleChange}
            required
          >
            {documentTypes.length > 0 ? (
              documentTypes.map(dt => (
                <option key={dt.id} value={dt.documentType}>
                  {dt.documentType} — ₱{dt.totalFee}
                </option>
              ))
            ) : (
              <option disabled>Loading types...</option>
            )}
          </select>
        </div>

        {/* Dynamic fields */}
        {documentConfig[formData.document_type]?.fields?.map(field => {
          if (field.type === "group") {
            return (
              <fieldset key={field.label}>
                <legend>{field.label}</legend>
                {field.fields.map(sub => (
                  <div className="form-group" key={sub.name}>
                    <label htmlFor={sub.name}>{sub.label}</label>
                    {sub.type === "select" ? (
                      <select id={sub.name} name={sub.name} value={formData[sub.name] || ""} onChange={handleChange} required={sub.required} >
                        <option value="">-- Select --</option>
                        {(sub.name === "location.barangay" ? barangayOptions : sub.options)?.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        id={sub.name} 
                        type={sub.type} 
                        name={sub.name} 
                        value={formData[sub.name] || sub.default || ""} 
                        onChange={handleChange} 
                        required={sub.required} 
                        readOnly={sub.readOnly}
                      /> 
                    )} 
                  </div> 
                ))} 
              </fieldset> 
            ); 
          }

          if (field.autoFill) {
            return (
              <div className="form-group" key={field.name}>
                <label htmlFor={field.name}>{field.label}</label>
                <input
                  id={field.name}
                  type={field.type}
                  name={field.name}
                  value={formData.complainant} 
                  readOnly
                />
              </div>
            );
          }

          if (field.type === "select" && field.name === "businessName") {
            const selectedBusiness = residentBusinesses.find(biz => biz.businessName === formData.businessName);
            return (
              <div className="form-group" key={field.name}>
                <label htmlFor={field.name}>{field.label}</label>
                <select
                  id={field.name}
                  name={field.name}
                  value={formData[field.name] || ""}
                  onChange={handleChange}
                  required={field.required}
                >
                  <option value="">Select your business</option>
                  {residentBusinesses.map(biz => (
                    <option key={biz.businessId} value={biz.businessName}>
                      {biz.businessName} — {biz.businessType}
                    </option>
                  ))}
                </select>

                {selectedBusiness && (
                  <p className="business-permit-hint">
                    {String(selectedBusiness.status).toLowerCase() === "approved"
                      ? `✅ Registered — Permit No. ${selectedBusiness.businessId} will be cited on the clearance.`
                      : `⚠️ This business's application is still ${selectedBusiness.status || "pending"} — no permit number will be cited yet.`}
                  </p>
                )}

                {/* 🔹 Render auto-filled address fields right after business select */}
                {formData.document_type === "Business Clearance" && formData.businessName && (
                  <fieldset>
                    <legend>Business Address</legend>
                    <div className="form-group">
                      <label>Street</label>
                      <input type="text" value={formData["location.street"]} readOnly />
                    </div>
                    <div className="form-group">
                      <label>Barangay</label>
                      <input type="text" value={formData["location.barangay"]} readOnly />
                    </div>
                    <div className="form-group">
                      <label>City</label>
                      <input type="text" value={formData["location.city"]} readOnly />
                    </div>
                    <div className="form-group">
                      <label>Province</label>
                      <input type="text" value={formData["location.province"]} readOnly />
                    </div>

                    {/* Hidden full address field for submission */}
                    <input
                      type="hidden"
                      name="address"
                      value={[
                        formData["location.street"],
                        `Brgy. ${formData["location.barangay"]}`,
                        formData["location.city"],
                        formData["location.province"]
                      ].filter(Boolean).join(", ")}
                    />
                  </fieldset>
                )}
              </div>
            );
          }



          return (
            <div className="form-group" key={field.name}>
              <label htmlFor={field.name}>{field.label}</label>
              {field.type === "textarea" ? (
                <textarea
                  id={field.name}
                  name={field.name}
                  value={formData[field.name] || ""}
                  onChange={handleChange}
                  required={field.required}
                />
              ) : (
                <input
                  id={field.name}
                  type={field.type}
                  name={field.name}
                  value={formData[field.name] || ""}
                  onChange={handleChange}
                  required={field.required}
                />
              )}
            </div>
          );
        })}

        {/* Dynamic attachments */}
        {documentConfig[formData.document_type]?.attachments?.map(att => {
          const isOptionalBusinessPermit =
            att.name === "businessPermit" &&
            formData.document_type === "Business Clearance" &&
            hasApprovedBusinessLinked();
          const isRequired = att.required && !isOptionalBusinessPermit;

          return (
            <div className="form-group" key={att.name}>
              <label htmlFor={att.name}>
                {att.label} {isRequired && <span className="required">*</span>}
              </label>
              {isOptionalBusinessPermit && (
                <p className="business-permit-hint">
                  ✅ Not required — this business's approved permit is already on file.
                </p>
              )}
              <input
                id={att.name}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                required={isRequired}
                onChange={e => handleFileChange(e, att.name)}
              />
            </div>
          );
        })}

        <button type="submit" className="submit-btn">
          Submit Request (₱{formData.fee})
        </button>
      </form>

      {status.message && (
        <p className={`status-message ${status.type}`}>{status.message}</p>
      )}
    </div>
  );
};

export default ResidentDocumentRequestForm;
