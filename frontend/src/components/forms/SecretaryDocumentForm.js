import { useState, useEffect } from "react";
import { usePublicFees } from "../../hooks/usePublicFees";
import { useResidents } from "../../hooks/useResidents";
import { auth, db } from "../../services/firebase";
import { doc, getDoc } from "firebase/firestore";
import PaymentForm from "./PaymentForm";
import documentConfig from "../../config/documentConfig";
import { resolveLocation } from "../../utils/resolveLocation"
import "../../styles/secretary/secretary-document-form.css";

const SecretaryDocumentWorkflow = ({ onCompleted }) => {
  const { documentTypes, loading: feesLoading, error: feesError } = usePublicFees();
  const { residents, loading: residentsLoading } = useResidents();

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

  // Load secretary profile
  useEffect(() => {
    const fetchSecretary = async () => {
      if (!auth.currentUser) return;
      const ref = doc(db, "users", auth.currentUser.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setCurrentSecretary({ ...snap.data(), uid: auth.currentUser.uid });
      }
    };
    fetchSecretary();
  }, []);

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
    fetch("http://localhost:8000/api/businesses")
      .then(res => res.json())
      .then(data => {
        // If backend returns { businesses: [...] }
        const list = Array.isArray(data.businesses) ? data.businesses : Array.isArray(data) ? data : [];
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
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e, field) => {
    const file = e.target.files[0];
    setAttachments(prev => ({ ...prev, [field]: file }));
  };

  const validateForm = () => {
    const config = documentConfig[formData.document_type] || {};
    const { fields = [], attachments: attachmentRules = [] } = config;

    if (formData.document_type === "Blotter Report" && !formData.resident_id) { 
      return "Resident must be selected for Blotter Report."; 
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

    for (const att of attachmentRules) {
      const file = attachments[att.name];
      if (att.required && !file) {
        return `${att.label} is required.`;
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

      const response = await fetch("http://localhost:8000/api/documents", {
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
      const refreshedDoc = await fetch(`http://localhost:8000/api/documents/${newDoc.id}`);
      const docData = await refreshedDoc.json();

      if (docData.paymentStatus !== "paid") {
        setStatus({ message: "❌ Payment not yet confirmed. Try again.", type: "error" });
        return;
      }

      const issueResponse = await fetch(`http://localhost:8000/api/documents/${newDoc.id}/issue`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issuedBy: currentSecretary.full_name }),
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
              <select
                name="resident_id"
                value={formData.resident_id}
                onChange={handleChange}
                required
              >
                <option value="">Select Resident</option>
                {residents.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.fullName} — {r.address.barangay}
                  </option>
                ))}
              </select>
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
                      <input
                        id={sub.name}
                        type={sub.type}
                        name={sub.name}
                        value={formData[sub.name] || ""}
                        onChange={handleChange}
                        required={sub.required}
                      />
                    </div>
                  ))}
                </fieldset>
              );
            }

            if (field.type === "select" && field.name === "businessName") {
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
                      {registeredBusinesses.length === 0 
                        ? "No businesses available" 
                        : "Select Business"} 
                    </option> 
                    {registeredBusinesses.map(b => ( 
                      <option key={b.id} value=
                        {b.businessName}> {b.businessName} — {b.address?.barangay} 
                      </option> 
                    ))} 
                  </select> 
                </div> 
              )
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

          {documentConfig[formData.document_type]?.attachments?.map(att => (
            <div className="form-group" key={att.name}>
              <label htmlFor={att.name}>
                {att.label} {att.required && <span className="required">*</span>}
              </label>
              <input
                id={att.name}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                required={att.required}
                onChange={e => handleFileChange(e, att.name)}
              />
            </div>
          ))}

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
