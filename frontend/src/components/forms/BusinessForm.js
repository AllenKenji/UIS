import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc } from 'firebase/firestore';
import { QRCodeCanvas } from 'qrcode.react';
import imageCompression from "browser-image-compression";
import { storage, db } from '../../services/firebase';
import { useUser } from "../../context/UserContext";
import { PARANAQUE } from "../../data/locations";
import './business-form.css';

const BusinessForm = ({ onBusinessAdded, onCancel }) => {
  const { register, handleSubmit, watch, reset, trigger } = useForm();
  const { userInfo: user } = useUser();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastBusinessId, setLastBusinessId] = useState('');

  const [documents, setDocuments] = useState({
    validId: null,
    proofOfAddress: null,
    dtiCert: null,
    businessLogo: null,
  });

  const [previews, setPreviews] = useState({});

  if (!user) {
    return <div className="loading-user">Loading your profile…</div>;
  }

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

    for (const key of Object.keys(documents)) {
      const file = documents[key];
      if (!file) continue;

      const compressed = await compressIfNeeded(file);

      const timestamp = Date.now();
      const fileRef = ref(storage, `businesses/${businessName}/${key}_${timestamp}_${file.name}`);

      await uploadBytes(fileRef, compressed);
      uploaded[key] = await getDownloadURL(fileRef);
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

      const payload = {
        ...data,
        ownerName: user.fullName,
        contactNumber: user.contactNumber,
        email: user.email,
        documents: uploadedDocs,
        status: "pending_evaluation",
        businessId: generateBusinessId(data.barangay),
        permitNumber: generatePermitNumber(data.barangay),
        submittedAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "businesses"), payload);

      toast.success(`✅ Business registered! ID: ${payload.businessId}`);
      setLastBusinessId(payload.businessId);

      reset();
      setDocuments({});
      setPreviews({});
      onBusinessAdded?.();

    } catch (error) {
      console.error("❌ Error registering business:", error);
      toast.error("❌ Failed to register business.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else navigate("/businesses");
  };

  // -----------------------------
  // STEP 1 — BUSINESS DETAILS
  // -----------------------------
  const renderStep1 = () => (
    <div className="form-step">
      <h2>🏢 Business Details</h2>

      <label>Business Name
        <input {...register('businessName', { required: true })} />
      </label>

      <label>Business Type
        <select {...register('businessType', { required: true })}>
          <option value="">Select Type</option>
          <option value="Sari-Sari Store">Sari-Sari Store</option>
          <option value="Food Stall">Food Stall</option>
          <option value="Online Seller">Online Seller</option>
          <option value="Service Provider">Service Provider</option>
          <option value="Other">Other</option>
        </select>
      </label>

      <label>Barangay
        <select {...register('barangay', { required: true })}>
          <option value="">Select Barangay</option>
          {PARANAQUE.barangays.map((brgy) => (
            <option key={brgy} value={brgy}>{brgy}</option>
          ))}
        </select>
      </label>

      <label>Business Address
        <input {...register('address', { required: true })} />
      </label>

      <label>Registration Date
        <input type="date" {...register('registrationDate', { required: true })} />
      </label>

      <button
        type="button"
        onClick={async () => {
          const valid = await trigger([
            "businessName",
            "businessType",
            "barangay",
            "address",
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

  // -----------------------------
  // STEP 2 — DOCUMENT SUBMISSION
  // -----------------------------
  const renderStep2 = () => {
    const allRequiredUploaded =
      documents.validId &&
      documents.proofOfAddress;

    return (
      <div className="form-step">
        <h2>📄 Document Submission</h2>

        <label>Valid ID (Required)
          <input type="file" accept="image/*,.pdf"
            onChange={(e) => handleDocumentChange(e, "validId")} />
        </label>
        {previews.validId && <img src={previews.validId} alt="" className="file-preview" />}

        <label>Proof of Address (Required)
          <input type="file" accept="image/*,.pdf"
            onChange={(e) => handleDocumentChange(e, "proofOfAddress")} />
        </label>
        {previews.proofOfAddress && <img src={previews.proofOfAddress} alt="" className="file-preview" />}

        <label>DTI Certificate (Optional)
          <input type="file" accept="image/*,.pdf"
            onChange={(e) => handleDocumentChange(e, "dtiCert")} />
        </label>
        {previews.dtiCert && <img src={previews.dtiCert} alt="" className="file-preview" />}

        <label>Business Logo (Optional)
          <input type="file" accept="image/*,.pdf"
            onChange={(e) => handleDocumentChange(e, "businessLogo")} />
        </label>
        {previews.businessLogo && <img src={previews.businessLogo} alt="" className="file-preview" />}

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
          <p className="warning-text">⚠️ Please upload all required documents to continue.</p>
        )}
      </div>
    );
  };

  // -----------------------------
  // STEP 3 — REVIEW & SUBMIT
  // -----------------------------
  const renderStep3 = () => {
    const data = watch();

    return (
      <div className="form-step">
        <h2>✅ Review & Submit</h2>

        <div className="review-box">
          <p><strong>Business Name:</strong> {data.businessName}</p>
          <p><strong>Type:</strong> {data.businessType}</p>
          <p><strong>Barangay:</strong> {data.barangay}</p>
          <p><strong>Address:</strong> {data.address}</p>
          <p><strong>Date:</strong> {data.registrationDate}</p>

          <hr />

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

      {lastBusinessId && (
        <div className="qr-wrapper">
          <p>📎 QR Code for Business ID:</p>
          <QRCodeCanvas value={lastBusinessId} size={128} />
        </div>
      )}
    </>
  );
};

export default BusinessForm;
