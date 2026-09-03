// src/components/forms/BusinessForm.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import imageCompression from "browser-image-compression";
import { useUser } from "../../context/UserContext";
import { PARANAQUE } from "../../data/locations";
import { usePublicFees } from "../../hooks/usePublicFees";
import { BusinessesAPI, NotificationsAPI, PublicServicesAPI } from "../../services/api";
import './business-form.css';

const BusinessForm = ({ onBusinessAdded, onCancel, residentProfile }) => {
  const { register, handleSubmit, watch, reset, trigger, setValue, setError, formState: { errors } } = useForm();
  const { userInfo } = useUser();
  const user = residentProfile
    ? { uid: residentProfile.residentId, fullName: residentProfile.fullName, email: residentProfile.email, contactNumber: residentProfile.contactNumber }
    : userInfo;
  const barangayId = residentProfile?.barangayId || userInfo?.barangayId;
  const navigate = useNavigate();

  // The barangay was already chosen when the resident entered the app
  // (via /b/:barangayId/...) or by their account's own barangay — the
  // business address should follow that, not ask the user to pick again.
  const [tenant, setTenant] = useState(null);
  useEffect(() => {
    if (!barangayId) return;
    PublicServicesAPI.getTenant(barangayId)
      .then((data) => {
        setTenant(data);
        // Readonly fields don't fire onChange, so react-hook-form never
        // sees this value land — push it into form state directly.
        setValue("barangay", data?.barangay || "", { shouldValidate: true });
      })
      .catch(() => setTenant(null));
  }, [barangayId, setValue]);

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step2Touched, setStep2Touched] = useState(false);


  // ✅ use public fees
  const { businessTypes: businessFees, loading, error } = usePublicFees(barangayId);

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

  // -----------------------------
  // SUBMIT HANDLER
  // -----------------------------
  // Business applications come from public residents who never log in (per
  // the barangay portal's "no account needed" flow), so documents are sent
  // straight to the (unauthenticated) application endpoint as multipart
  // form data — not pre-uploaded via /api/storage/upload, which requires a
  // login session public visitors don't have.
  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      const fullAddress = [data.street, data.barangay, data.city, data.province]
        .filter(Boolean)
        .join(", ");

      const formData = new FormData();
      formData.append("owner_uid", user.uid);
      formData.append("owner_name", user.fullName || user.full_name || user.email);
      formData.append("contact_number", user.contactNumber || user.contact_number || "");
      formData.append("email", user.email);
      formData.append("business_name", data.businessName);
      formData.append("business_type", data.businessType);
      formData.append("barangay", data.barangay);
      formData.append("street", data.street || "");
      formData.append("city", data.city || "");
      formData.append("province", data.province || "");
      formData.append("address", fullAddress);
      formData.append("registration_date", new Date().toISOString());
      formData.append("is_franchise", data.isFranchise ? "true" : "false");

      const attach = async (field, file) => {
        if (!file) return;
        const compressed = await compressIfNeeded(file);
        formData.append(field, compressed, sanitize(file.name));
      };
      await attach("valid_id", documents.validId);
      await attach("proof_of_address", documents.proofOfAddress);
      await attach("dti_cert", documents.dtiCert);
      await attach("business_logo", documents.businessLogo);

      await BusinessesAPI.createApplication(formData);
      // Best-effort: the application is already saved above, so a failed
      // staff notification shouldn't be reported as a failed registration
      // (matches the same guard already used in StaffBusinessForm.jsx).
      await NotificationsAPI.createBusinessSubmitted(
        user?.fullName || user?.name || user?.email || "Resident",
        data.businessName
      ).catch((notifyError) => {
        console.warn("⚠️ Business registration notification failed:", notifyError);
      });
      toast.success("📌 Application submitted for staff evaluation.");

      reset();
      setDocuments({ validId: null, proofOfAddress: null, dtiCert: null, businessLogo: null });
      setPreviews({});
      onBusinessAdded?.();
      handleCancel();
    } catch (error) {
      console.error("❌ Error registering business:", error);
      // handleError (services/api.js) already extracts a specific, readable
      // message onto error.message (e.g. duplicate business name) — show
      // that instead of a generic failure when we have it.
      toast.error(error?.status ? `❌ ${error.message}` : "❌ Failed to register business.");

      // A duplicate name is a Business Name problem specifically — highlight
      // that field (same red .input-error treatment as required-field
      // validation) and jump back to step 1 so the resident actually sees it.
      if (error?.status === 409) {
        setError("businessName", { type: "manual", message: error.message });
        setStep(1);
      }
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleCancel = () => {
    if (onCancel) onCancel();
    else navigate(residentProfile ? "/public-services" : "/businesses/my");
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
          <input
            id="businessName"
            className={errors.businessName ? "input-error" : ""}
            {...register("businessName", { required: "Business name is required" })}
          />
          {errors.businessName && <span className="error-text">{errors.businessName.message}</span>}
        </label>

        <label htmlFor="isFranchise" className="checkbox-label">
          <input id="isFranchise" type="checkbox" {...register("isFranchise")} />
          This is a franchise or branch of an existing business
          <span className="field-hint">
            Check this if another branch already uses this business name in your barangay.
          </span>
        </label>

        <label htmlFor="businessType">Business Type
          <select
            id="businessType"
            className={errors.businessType ? "input-error" : ""}
            {...register("businessType", { required: "Business type is required" })}
          >
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
            <input
              id="street"
              className={errors.street ? "input-error" : ""}
              {...register("street", { required: "Street is required" })}
            />
            {errors.street && <span className="error-text">{errors.street.message}</span>}
          </label>

          <label htmlFor="barangay">Barangay
            <input
              id="barangay"
              value={tenant?.barangay || ""}
              readOnly
              placeholder={tenant ? "" : "Loading barangay…"}
              className={errors.barangay ? "input-error" : ""}
              {...register("barangay", { required: "Barangay is required" })}
            />
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
          <input
            id="registrationDate"
            type="date"
            className={errors.registrationDate ? "input-error" : ""}
            {...register("registrationDate", { required: "Registration date is required" })}
          />
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
        <label className={step2Touched && !documents.validId ? "input-error upload-required" : "upload-required"}>
          Valid ID (Required)
          <input type="file" accept="image/*,.pdf" onChange={(e) => handleDocumentChange(e, "validId")} />
        </label>
        {step2Touched && !documents.validId && <span className="error-text">Valid ID is required</span>}
        {renderPreview(documents.validId, previews.validId, "Valid ID")}
        <label className={step2Touched && !documents.proofOfAddress ? "input-error upload-required" : "upload-required"}>
          Proof of Address (Required)
          <input type="file" accept="image/*,.pdf" onChange={(e) => handleDocumentChange(e, "proofOfAddress")} />
        </label>
        {step2Touched && !documents.proofOfAddress && <span className="error-text">Proof of Address is required</span>}
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
            onClick={() => {
              if (!allRequiredUploaded) {
                setStep2Touched(true);
                toast.error("⚠️ Please upload all required documents to continue.");
                return;
              }
              setStep(3);
            }}
          >
            Next →
          </button>
        </div>
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
          {data.isFranchise && <p><strong>Franchise/Branch:</strong> Yes</p>}
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
