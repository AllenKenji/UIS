import { useState, useEffect } from "react";
import { usePublicFees } from "../../hooks/usePublicFees";
import { useResidents } from "../../hooks/useResidents";
import { useUser } from "../../context/UserContext";
import PaymentForm from "./PaymentForm";
import ResidentPicker from "./ResidentPicker";
import documentConfig from "../../config/documentConfig";
import { resolveLocation } from "../../utils/resolveLocation"
import { API_BASE_URL, BusinessesAPI, PublicServicesAPI } from "../../services/api";
import { PARANAQUE } from "../../data/locations";
import "../../styles/secretary/secretary-document-form.css";

const SecretaryDocumentWorkflow = ({ onCompleted }) => {
  const { userInfo } = useUser();
  const { documentTypes, loading: feesLoading, error: feesError } = usePublicFees(userInfo?.barangayId);
  // resolve_tenant_scope already restricts this to the secretary's own barangay,
  // server-side (see backend/app/routes/resident_routes.py).
  const { residents: allResidents, loading: residentsLoading } = useResidents();
  // Residents with no verificationStatus at all (staff-entered, or predating this
  // field) are treated as verified elsewhere in the app (see
  // resident_service.require_verified_resident) — only actually exclude ones still
  // pending or rejected from the walk-in dropdown, not a strict "verified" match.
  const residents = allResidents.filter(
    (r) => r.verificationStatus !== "pending" && r.verificationStatus !== "rejected"
  );

  const [formData, setFormData] = useState({
    resident_id: "",
    document_type: "",
    fee: 0,
  });
  const [attachments, setAttachments] = useState({});
  const [currentSecretary, setCurrentSecretary] = useState(null);
  const [status, setStatus] = useState({ message: null, type: null });
  const [newDoc, setNewDoc] = useState(null);
  const [issuedDocUrl, setIssuedDocUrl] = useState(null);
  const [registeredBusinesses, setRegisteredBusinesses] = useState([]);
  const [issueRemarks, setIssueRemarks] = useState("");
  // Options for the Activity/Incident Location "Barangay" field — sourced
  // from the barangays actually registered under the super admin account
  // for this city, not a hardcoded list, so it can't drift out of date.
  const [barangayOptions, setBarangayOptions] = useState([]);


  // Load secretary profile
  useEffect(() => {
    if (userInfo) setCurrentSecretary(userInfo);
  }, [userInfo]);

  // Initialize default document type
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

  useEffect(() => {
    // Resolve the current barangay's own "city" value first, rather than
    // assuming it matches the PARANAQUE.city constant exactly — the super
    // admin's "City" field on Barangays & Cities is free text, so a tenant
    // registered as e.g. "Paranaque" (no tilde) would never match a
    // hardcoded "Parañaque" and silently leave this dropdown empty.
    if (!userInfo?.barangayId) {
      setBarangayOptions([]);
      return;
    }
    let active = true;
    Promise.all([
      PublicServicesAPI.getTenant(userInfo.barangayId),
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
  }, [userInfo?.barangayId]);

  useEffect(() => {
    BusinessesAPI.listAll()
      .then(data => {
        // If backend returns { businesses: [...] }
        const list = Array.isArray(data.businesses)
          ? data.businesses
          : Array.isArray(data)
          ? data
          : [];
        setRegisteredBusinesses(list);
      })
      .catch(() => setRegisteredBusinesses([]));
  }, []);

  useEffect(() => {
    if (formData.document_type === "Blotter Report" && formData.resident_id) {
      const resident = residents.find(r => r.id === formData.resident_id);
      if (resident) {
        setFormData(prev => ({ ...prev, complainant: resident.fullName }));
      }
    }
  }, [formData.document_type, formData.resident_id, residents]);

  const handleChange = e => {
    const { name, value } = e.target;

    if (name === "document_type") {
      const selected = documentTypes.find(dt => dt.documentType === value);
      setFormData(prev => ({
        ...prev,
        document_type: value,
        fee: selected?.totalFee || 0,
      }));
    } else if (name === "businessName") {
      // 🔹 Find the selected resident
      const resident = residents.find(r => r.id === formData.resident_id);

      // 🔹 Find the business owned by that resident
      const business = registeredBusinesses.find(
        b => b.businessName === value && b.ownerName === resident?.fullName
      );

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
    const resident = residents.find(r => r.id === formData.resident_id);
    const business = registeredBusinesses.find(
      b => b.businessName === formData.businessName && b.ownerName === resident?.fullName
    );
    return Boolean(business) && String(business.status).toLowerCase() === "approved";
  };

  const validateForm = () => {
    const config = documentConfig[formData.document_type] || {};
    const { fields = [], attachments: attachmentRules = [] } = config;

    // A resident-picker match is required to submit at all — the visible text
    // input alone can't be trusted by native "required" validation, since it
    // stays non-empty while the user is still typing/hasn't picked a match.
    if (!formData.resident_id) {
      return "Please select a resident from the list.";
    }

    for (const field of fields) {
      if (formData.document_type === "Blotter Report" && field.name === "complainant") { 
        continue; 
      }
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
      if (att.required && !file) {
        return `${att.label} is required.`;
      }
    }

    if (formData.document_type === "Business Clearance") {
      const loc = resolveLocation(formData.document_type, formData, residents, registeredBusinesses);
      if (!loc.address) return "Business address is required.";
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
    if (!currentSecretary) {
      setStatus({ message: "❌ Secretary profile not loaded yet.", type: "error" });
      return;
    }

    setStatus({ message: "Creating document...", type: "loading" });

    try {
      const payload = new FormData();
      payload.append("resident_id", formData.resident_id);
      payload.append("document_type", formData.document_type);

      const config = documentConfig[formData.document_type] || {};
      const { fields = [], attachments: attachmentRules = [] } = config;

      const loc = resolveLocation(formData.document_type, formData, residents, registeredBusinesses);

      if (formData.document_type !== "Barangay Clearance") { 
        if (loc.barangay) payload.append("locationBarangay", loc.barangay); 
        if (loc.street) payload.append("locationStreet", loc.street); 
        if (loc.city) payload.append("locationCity", loc.city); 
        if (loc.province) payload.append("locationProvince", loc.province); 
      }

      if (formData.document_type === "Business Clearance") {
        if (loc.barangay) payload.append("locationBarangay", loc.barangay);
        if (loc.street) payload.append("locationStreet", loc.street);
        if (loc.city) payload.append("locationCity", loc.city);
        if (loc.province) payload.append("locationProvince", loc.province);
        // ✅ Add normalized full address
        payload.append("address", loc.address);
        // Links this request to the resident's already-registered business —
        // if it's approved, the generated clearance cites its permit number
        // (see document_service.prepare_generator_data).
        if (formData.businessId) payload.append("businessId", formData.businessId);
      }

      fields.forEach(field => {
        if (field.type === "group" && Array.isArray(field.fields)) {
          field.fields.forEach(sub => {
            if (!sub.name?.startsWith("location.")) {
              const value = formData[sub.name];
              if (value !== undefined && value !== null && value !== "") {
                payload.append(sub.name, value);
              }
            }
          });
        } else if (field.name && !field.name.startsWith("location.")) {
          if (!(formData.document_type === "Blotter Report" && field.name === "complainant")) {
            const value = formData[field.name];
            if (value !== undefined && value !== null && value !== "") {
              payload.append(field.name, value);
            }
          }
        }
      });

      if (formData.document_type === "Blotter Report" && formData.complainant) { 
        payload.append("complainant", formData.complainant); 
      }

      attachmentRules.forEach(att => {
        if (attachments[att.name]) {
          payload.append(att.name, attachments[att.name]);
        }
      });

      const response = await fetch(`${API_BASE_URL}/api/documents`, {
        method: "POST",
        body: payload,
      });
      if (!response.ok) throw new Error(`Backend error: ${response.statusText}`);
      const createdDoc = await response.json();

      setNewDoc(createdDoc);
      setStatus({ message: "✅ Document created. Proceed to payment.", type: "success" });
    } catch (err) {
      console.error("❌ Error creating document:", err);
      setStatus({ message: "❌ Failed to create document.", type: "error" });
    }
  };

  const handlePaymentCompleted = async () => {
    try {
      // Re-fetch document to ensure payment status is updated
      const refreshedDoc = await fetch(`${API_BASE_URL}/api/documents/${newDoc.id}`);
      const docData = await refreshedDoc.json();

      if (docData.status !== "paid" && docData.status !== "payment_submitted") {
        setStatus({ message: "❌ Payment not yet confirmed. Try again.", type: "error" });
        return;
      }

      const issueResponse = await fetch(`${API_BASE_URL}/api/documents/${newDoc.id}/issue`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issued_by: currentSecretary.full_name || currentSecretary.fullName,
          issuedByUid: currentSecretary.uid,
          remarks: issueRemarks || `Issued by ${currentSecretary.full_name}` || `Issued by ${currentSecretary.fullName}`,
        }),
      });

      if (!issueResponse.ok) {
        const errData = await issueResponse.json();
        throw new Error(errData.detail || issueResponse.statusText);
      }

      const issuedDoc = await issueResponse.json();
      setIssuedDocUrl(issuedDoc.fileUrl);
      setStatus({ message: "✅ Document issued successfully.", type: "success" });
      onCompleted?.(issuedDoc);
    } catch (err) {
      console.error("❌ Error issuing document:", err);
      setStatus({ message: `❌ Failed to issue document: ${err.message}`, type: "error" });
    }
  };

  return (
    <div className="secretary-document-form">
      <h2>📑 Walk-In Document Issuance</h2>

      {feesLoading && <p>Loading document types...</p>}
      {feesError && <p className="status-message error">❌ {feesError}</p>}

      {!newDoc && (
        <form onSubmit={handleSubmit}>
          {/* Resident selection */}
          <div className="form-group">
            <label htmlFor="resident_id">Select Resident</label>
            {residentsLoading ? (
              <p>Loading residents...</p>
            ) : (
              <ResidentPicker
                id="resident_id"
                residents={residents}
                value={formData.resident_id}
                onChange={(residentId) => setFormData(prev => ({ ...prev, resident_id: residentId }))}
              />
            )}
          </div>

          {/* Document type */}
          <div className="form-group">
            <label htmlFor="document_type">Document Type</label>
            <select
              name="document_type"
              value={formData.document_type}
              onChange={handleChange}
              required
            >
              {documentTypes.map(dt => (
                <option key={dt.id} value={dt.documentType}>
                  {dt.documentType} — ₱{dt.totalFee}
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic fields */}
          {documentConfig[formData.document_type]?.fields?.map(field => {
            if (formData.document_type === "Blotter Report" && field.name === "complainant") { 
              return ( 
                <div className="form-group" key={field.name}> 
                  <label htmlFor={field.name}>{field.label}</label> 
                  <input 
                    id={field.name} 
                    type="text" 
                    name={field.name} 
                    value={formData.complainant || ""} 
                    readOnly 
                  /> 
                </div> 
              ); 
            }

            if (field.type === "group") {
              return (
                <fieldset key={field.label}>
                  <legend>{field.label}</legend>
                  {field.fields.map(sub => (
                    <div className="form-group" key={sub.name}>
                      <label htmlFor={sub.name}>{sub.label}</label>

                      {sub.type === "select" ? (
                        <select
                          id={sub.name}
                          name={sub.name}
                          value={formData[sub.name] || ""}
                          onChange={handleChange}
                          required={sub.required}
                        >
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
                        />
                      )}
                    </div>
                  ))}
                </fieldset>
              );
            }

            if (field.type === "select" && field.name === "businessName") {
              // 🔹 Only show businesses for the selected resident
              const resident = residents.find(r => r.id === formData.resident_id);
              const residentBusinesses = resident
                ? registeredBusinesses.filter(b => b.ownerName === resident.fullName)
                : [];
              const selectedBusiness = residentBusinesses.find(b => b.businessName === formData.businessName);

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
                    <option value="">
                      {residentBusinesses.length === 0
                        ? "No businesses available for this resident"
                        : "Select Business"}
                    </option>
                    {residentBusinesses.map(b => (
                      <option key={b.businessId} value={b.businessName}>
                        {b.businessName}
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

                  {/* 🔹 Show auto-filled business address when selected */}
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

                      {/* Hidden full address for backend */}
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
                <input
                  id={field.name}
                  type={field.type}
                  name={field.name}
                  value={formData[field.name] || ""}
                  onChange={handleChange}
                  required={field.required}
                />
              </div>
            );
          })}

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

                    <button type="submit" className="submit-btn" disabled={!currentSecretary}>
            Create Document (₱{formData.fee})
          </button>
        </form>
      )}

      {status.message && <p className={`status-message ${status.type}`}>{status.message}</p>}

      {/* ✅ PaymentForm appears after document creation */}
      {newDoc && !issuedDocUrl && (
        <PaymentForm
          docId={newDoc.id}
          entityId={newDoc.id}
          entityType="document"
          resident={residents.find(r => r.id === formData.resident_id)}
          entityCategory={formData.document_type}
          description={newDoc.documentType}
          fee={newDoc.amount}
          customEntityId={newDoc.documentId}
          onCancel={() => setNewDoc(null)}
          onPaymentCompleted={handlePaymentCompleted}
        />
      )}

      {/* ✅ After payment, issue document */}
      {issuedDocUrl && (
        <div className="download-section">
          
          <a
            href={issuedDocUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="download-btn"
          >
            📥 Download Issued Document (PDF)
          </a>
          <button
            type="button"
            className="print-btn"
            onClick={() => {
              const printWindow = window.open(issuedDocUrl, "_blank");
              if (printWindow) {
                printWindow.addEventListener("load", () => {
                  printWindow.print();
                });
              }
            }}
          >
            🖨️ Print Document
          </button>
          <button
            type="button"
            className="back-btn"
            onClick={() => {
              setNewDoc(null);
              setIssuedDocUrl(null);
              setStatus({ message: null, type: null });
              setFormData({
                resident_id: "",
                document_type: documentTypes.length > 0 ? documentTypes[0].documentType : "",
                fee: documentTypes.length > 0 ? documentTypes[0].totalFee : 0,
              });
              setAttachments({});
              setIssueRemarks("");
            }}
          >
            ⬅️ Back to Form
          </button>
        </div>
      )}
    </div>
  );
};

export default SecretaryDocumentWorkflow;
