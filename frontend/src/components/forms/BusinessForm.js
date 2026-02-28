// src/components/forms/BusinessForm.jsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc } from 'firebase/firestore';
import imageCompression from "browser-image-compression";
import { storage, db } from '../../services/firebase';
import { useUser } from "../../context/UserContext";
import { PARANAQUE } from "../../data/locations";
import { usePublicFees } from "../../hooks/usePublicFees";   
import './business-form.css';

const BusinessForm = ({ onBusinessAdded, onCancel }) => {
  const { register, handleSubmit, watch, reset, trigger, formState: { errors } } = useForm();
  const { userInfo: user } = useUser();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  

  // ✅ use public fees
  const { businessTypes: businessFees, loading, error } = usePublicFees();

  const [documents, setDocuments] = useState({
    validId: null,
    proofOfAddress: null,
    dtiCert: null,
    businessLogo: null,
  });
  const [previews, setPreviews] = useState({});

  const sanitize = (str) => str.replace(/[^a-zA-Z0-9_.-]/g, "_");

  if (!user) return <div className="loading-user">Loading your profile…</div>;
  if (loading) return <div className="loading-user">Loading business types…</div>;
  if (error) toast.error("⚠️ Could not load business types.");

  // -----------------------------
  // FILE HANDLING + COMPRESSION
  // -----------------------------
  const handleDocumentChange = (e, field) => {
    const selected = e.target.files[0];
    if (!selected) return;
    if (selected.size > 5 * 1024 * 1024) {
      toast.error("❌ File must be under 5MB.");
      return;
    }
    setDocuments(prev => ({ ...prev, [field]: selected }));
    setPreviews(prev => ({ ...prev, [field]: URL.createObjectURL(selected) }));
  };

  const compressIfNeeded = async (file) => {
    if (!file.type.startsWith("image/")) return file;
    try {
      return await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1280,
        useWebWorker: true,
      });
    } catch {
      return file;
    }
  };

  const uploadAllDocuments = async (businessName) => {
    const uploaded = {};
    const safeBusinessName = sanitize(businessName);

    for (const key of Object.keys(documents)) {
      const file = documents[key];
      if (!file) continue;

      const compressed = await compressIfNeeded(file);
      const safeFileName = sanitize(file.name);
      const timestamp = Date.now();

      const path = `businesses/${safeBusinessName}/${key}_${timestamp}_${safeFileName}`;
      const fileRef = ref(storage, path);

      await uploadBytes(fileRef, compressed);
      const url = await getDownloadURL(fileRef);

      // ✅ Save both URL and path
      uploaded[key] = { url, path };
    }

    return uploaded;
  };

  // -----------------------------
  // ID GENERATORS
  // -----------------------------
  const generateBusinessId = (barangay) => {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `BIZ-${barangay?.toUpperCase()}-${year}-${random}`;
  };

  const generatePermitNumber = (barangay) => {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `PERMIT-${year}-${barangay?.toUpperCase()}-${random}`;
  };

  // -----------------------------
  // SUBMIT HANDLER
  // -----------------------------
  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      const uploadedDocs = await uploadAllDocuments(data.businessName);

      const fullAddress = [data.street, data.barangay, data.city, data.province]
        .filter(Boolean)
        .join(", ");

      // 🔎 Resolve fee for selected business type
      const feeInfo = businessFees.find(f => f.businessType === data.businessType);
      const amount = feeInfo ? feeInfo.registrationTotal : 0; 
      // or annualTotal depending on your workflow

      const payload = {
        ...data,
        address: fullAddress,
        ownerName: user.fullName,
        contactNumber: user.contactNumber,
        email: user.email,
        documents: uploadedDocs,
        status: "pending_evaluation",          // ✅ matches your workflow
        amount,                         // ✅ include fee amount
        businessId: generateBusinessId(data.barangay),
        permitNumber: generatePermitNumber(data.barangay),
        submittedAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "businesses"), payload);
      toast.success("📌 Application submitted for staff evaluation.");

      reset();
      setDocuments({ validId: null, proofOfAddress: null, dtiCert: null, businessLogo: null });
      setPreviews({});
      onBusinessAdded?.();
      handleCancel();
    } catch (error) {
      console.error("❌ Error registering business:", error);
      toast.error("❌ Failed to register business.");
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleCancel = () => {
    if (onCancel) onCancel();
    else navigate("/businesses/my");
  };

  // -----------------------------
  // STEP 1 — BUSINESS DETAILS
  // -----------------------------
  const renderStep1 = () => {
    const street = watch("street");
    const barangay = watch("barangay");
    const city = watch("city");
    const province = watch("province");

    const fullAddress = [street, barangay, city, province].filter(Boolean).join(", ");

    return (
      <div className="form-step">
        <h2>🏢 Business Details</h2>

        <label htmlFor="businessName">Business Name
          <input id="businessName" {...register("businessName", { required: "Business name is required" })} />
          {errors.businessName && <span className="error-text">{errors.businessName.message}</span>}
        </label>

        <label htmlFor="businessType">Business Type
          <select id="businessType" {...register("businessType", { required: "Business type is required" })}>
            <option value="">Select Type</option>
            {businessFees.map(bt => (
              <option key={bt.id} value={bt.businessType}>
                {bt.businessType} — ₱{bt.registrationTotal}
              </option>
            ))}
          </select>
          {errors.businessType && <span className="error-text">{errors.businessType.message}</span>}
        </label>

        <fieldset className="address-fieldset">
          <legend>Business Address</legend>

          <label htmlFor="street">Blk# / Lot#, Street
            <input id="street" {...register("street", { required: "Street is required" })} />
            {errors.street && <span className="error-text">{errors.street.message}</span>}
          </label>

          <label htmlFor="barangay">Barangay
            <select id="barangay" {...register("barangay", { required: "Barangay is required" })}>
              <option value="">Select Barangay</option>
              {PARANAQUE.barangays.map(brgy => (
                <option key={brgy} value={brgy}>{brgy}</option>
              ))}
            </select>
            {errors.barangay && <span className="error-text">{errors.barangay.message}</span>}
          </label>

          <label htmlFor="city">City
            <input id="city" value={PARANAQUE.city} readOnly {...register("city")} />
          </label>

          <label htmlFor="province">Province
            <input id="province" value={PARANAQUE.province} readOnly {...register("province")} />
          </label>
        </fieldset>

        {/* Hidden full address field */}
        <input type="hidden" {...register("address")} value={fullAddress} />

        <label htmlFor="registrationDate">Registration Date
          <input id="registrationDate" type="date" {...register("registrationDate", { required: "Registration date is required" })} />
          {errors.registrationDate && <span className="error-text">{errors.registrationDate.message}</span>}
        </label>

        <button
          type="button"
          onClick={async () => {
            const valid = await trigger([
              "businessName",
              "businessType",
              "barangay",
              "street",
              "city",
              "province",
              "registrationDate",
            ]);
            if (valid) setStep(2);
            else toast.error("⚠️ Please fill in all required fields.");
          }}
        >
          Next →
        </button>
      </div>
    );
  };

  // -----------------------------
  // STEP 2 — DOCUMENT SUBMISSION
  // -----------------------------
  const renderStep2 = () => {
    const allRequiredUploaded = documents.validId && documents.proofOfAddress;
    const renderPreview = (file, previewUrl, label) => {
      if (!file || !previewUrl) return null;
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      return (
        <div className="file-preview-wrapper">
          {isPdf ? (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
              📄 View {label} PDF ({file.name})
            </a>
          ) : (
            <img src={previewUrl} alt={`Preview of uploaded ${label}`} className="file-preview" />
          )}
          <p className="file-name">{file.name}</p>
        </div>
      );
    };
    return (
      <div className="form-step">
        <h2>📄 Document Submission</h2>
        <label>Valid ID (Required)
          <input type="file" accept="image/*,.pdf" onChange={(e) => handleDocumentChange(e, "validId")} />
        </label>
        {renderPreview(documents.validId, previews.validId, "Valid ID")}
        <label>Proof of Address (Required)
          <input type="file" accept="image/*,.pdf" onChange={(e) => handleDocumentChange(e, "proofOfAddress")} />
        </label>
        {renderPreview(documents.proofOfAddress, previews.proofOfAddress, "Proof of Address")}
        <label>DTI Certificate (Optional)
          <input type="file" accept="image/*,.pdf" onChange={(e) => handleDocumentChange(e, "dtiCert")} />
        </label>
        {renderPreview(documents.dtiCert, previews.dtiCert, "DTI Certificate")}
        <label>Business Logo (Optional)
          <input type="file" accept="image/*,.pdf" onChange={(e) => handleDocumentChange(e, "businessLogo")} />
        </label>
                {renderPreview(documents.businessLogo, previews.businessLogo, "Business Logo")}

        <div className="step-buttons">
          <button type="button" onClick={() => setStep(1)}>← Back</button>
          <button
            type="button"
            disabled={!allRequiredUploaded}
            onClick={() => setStep(3)}
          >
            Next →
          </button>
        </div>

        {!allRequiredUploaded && (
          <p className="warning-text">
            ⚠️ Please upload all required documents to continue.
          </p>
        )}
      </div>
    );
  };

  // -----------------------------
  // STEP 3 — REVIEW & SUBMIT
  // -----------------------------
  const renderStep3 = () => {
    const data = watch();

    const fullAddress = data.address ||
      [data.street, data.barangay, data.city, data.province].filter(Boolean).join(", ");
    
    const feeInfo = businessFees.find(f => f.businessType === data.businessType); 
    const amount = feeInfo ? feeInfo.registrationTotal : 0;

    return (
      <div className="form-step">
        <h2>✅ Review & Submit</h2>

        <div className="review-box">
          <h3>Business Details</h3>
          <p><strong>Name:</strong> {data.businessName}</p>
          <p><strong>Type:</strong> {data.businessType}</p>
          <p><strong>Barangay:</strong> {data.barangay}</p>
          <p><strong>Address:</strong> {fullAddress}</p>
          <p><strong>Registration Date:</strong> {data.registrationDate}</p>
          <p><strong>Fee Amount:</strong> ₱{amount}</p>

          <hr />

          <h3>Owner Details</h3>
          <p><strong>Owner:</strong> {user?.fullName || "N/A"}</p>
          <p><strong>Contact:</strong> {user?.contactNumber || "N/A"}</p>
          <p><strong>Email:</strong> {user?.email || "N/A"}</p>
        </div>

        <div className="step-buttons">
          <button type="button" onClick={() => setStep(2)}>← Back</button>
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting..." : "Submit Application"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)} className="business-form">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}

        <button type="button" onClick={handleCancel} className="cancel-btn">
          Cancel
        </button>
      </form>
    </>
  );
};

export default BusinessForm;
