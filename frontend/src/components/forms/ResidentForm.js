import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { ResidentsAPI } from "../../services/api";
import { toast } from "react-toastify";
import { auth } from "../../services/firebase";
import SignatureField from "./SignatureField";
import { uploadFile, uploadBase64Image, uploadThumbprint } from "../../utils/fileUtils";
import { PARANAQUE } from "../../data/locations";
import { cleanPayload } from "../../utils/cleanPayload";
import { sendEmail } from "../../services/email";
import "./resident-form.css";

const LEGACY_BARANGAY_ALIASES = {
  "Sto. Niño": "Santo Niño",
};

const normalizeBarangayName = (value) => {
  const trimmed = (value || "").trim();
  return LEGACY_BARANGAY_ALIASES[trimmed] || trimmed;
};

const getAuthUid = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("❌ Missing Firebase Auth UID. User may not be authenticated.");
  return uid;
};

const calculateAge = (birthDate) => {
  const today = new Date();
  const dob = new Date(birthDate);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
};

const ResidentForm = ({ onResidentAdded, onCancel, user: userProp }) => {
  const outlet = useOutletContext();
  const user = userProp || outlet?.user;
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({ shouldFocusError: true });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photo, setPhoto] = useState({ file: null, preview: null });
  const [leftThumb, setLeftThumb] = useState({ file: null, preview: null });
  const [rightThumb, setRightThumb] = useState({ file: null, preview: null });
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [isSignatureEmpty, setIsSignatureEmpty] = useState(true);

  const birthDate = watch("birthDate");
  const fullName = watch("fullName");
  const age = birthDate ? calculateAge(birthDate) : "";

  const handleFileChange = (e, setter, label) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024)
      return toast.error(`❌ ${label} must be under 2MB.`);
    if (!file.type.startsWith("image/"))
      return toast.error(`❌ Only image files allowed for ${label}.`);
    setter({ file, preview: URL.createObjectURL(file) });
  };

  const buildPayload = async (data) => {
    const uid = getAuthUid();
    await auth.currentUser.getIdToken(true);
    const tokenResult = await auth.currentUser.getIdTokenResult();
    console.log("🔑 Current role claim:", tokenResult.claims.role);

    let photoUrl = null;
    let leftThumbUrl = null;
    let rightThumbUrl = null;
    let signatureUrl = null;

    try {
      if (photo.file) photoUrl = await uploadFile(uid, photo.file, "photos", true);
      if (leftThumb.file) leftThumbUrl = await uploadThumbprint(uid, leftThumb.file, "left");
      if (rightThumb.file) rightThumbUrl = await uploadThumbprint(uid, rightThumb.file, "right");
      if (signatureDataUrl) signatureUrl = await uploadBase64Image(uid, signatureDataUrl, "signatures");
    } catch (err) {
      console.error("❌ Upload failed:", err);
      throw new Error("❌ Upload failed. Please retry.");
    }

    return cleanPayload(data, {
      photoUrl,
      fingerprints: { left: leftThumbUrl, right: rightThumbUrl },
      signatureUrl,
    });
  };

  const clearForm = () => {
    reset();
    setPhoto({ file: null, preview: null });
    setLeftThumb({ file: null, preview: null });
    setRightThumb({ file: null, preview: null });
    setSignatureDataUrl("");
    setIsSignatureEmpty(true);
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      if (isSignatureEmpty) {
        toast.error("❌ Please provide a signature before submitting.");
        return;
      }

      const existing = await ResidentsAPI.findByNameAndBirthDate(data.fullName, data.birthDate);
      if (existing?.length) {
        toast.error("❌ Duplicate resident detected!");
        return;
      }

      const payload = await buildPayload(data);
      if (payload.address?.barangay) {
        payload.address.barangay = normalizeBarangayName(payload.address.barangay);
      }

      console.log("✅ Payload email before sendWelcomeEmail:", payload.email);


      if (
        (photo.file && !payload.photoUrl) ||
        (leftThumb.file && !payload.fingerprints.left) ||
        (rightThumb.file && !payload.fingerprints.right) ||
        (signatureDataUrl && !payload.signatureUrl)
      ) {
        toast.error("❌ One or more uploads failed. Please try again.");
        return;
      }

      console.log("🚀 Final payload:", payload);
      const created = await ResidentsAPI.create(payload);
      const residentId = created?.id || created?.uid;
      if (!residentId) throw new Error("❌ Backend did not return a resident ID.");

      // 🔔 Send welcome email 
      try {
        await sendEmail({ 
          type: "welcome",
          fullName: payload.fullName, 
          email: payload.email, 
          barangay: payload.address?.barangay || payload.barangay, 
        });
        console.log("📩 Function received payload:", payload);
        console.log("📩 Sending email to:", payload.email);

        toast.success("✅ Resident added and email sent!");
      } catch (emailErr) {
        console.error("❌ Failed to send welcome email:", emailErr);
        toast.warning("✅ Resident added but failed to send welcome email.");
      }
      clearForm();
      if (onResidentAdded) onResidentAdded(residentId);
      else navigate(`/residents`);
    } catch (error) {
      console.error("❌ Error adding resident:", error);
      toast.error(error?.response?.data?.message || error.message || "❌ Failed to add resident.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else navigate("/residents");
  };

  if (!user) return <p className="auth-warning">❌ You must be logged in to add a resident.</p>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="resident-form">
      {/* Full Name */}
      <label htmlFor="fullName">Full Name</label>
      <input id="fullName" {...register("fullName", { required: "Full name is required" })} className={errors.fullName ? "input-error" : ""} />
      {errors.fullName && <span className="error">{errors.fullName.message}</span>}

      {/* Birth Date */}
      <label htmlFor="birthDate">Birth Date</label>
      <input id="birthDate" type="date" {...register("birthDate", { required: "Birth date is required" })} className={errors.birthDate ? "input-error" : ""} />
      {errors.birthDate && <span className="error">{errors.birthDate.message}</span>}
      {age && <p>Age: {age}</p>}

      {/* Gender */}
      <label htmlFor="gender">Gender</label>
      <select id="gender" {...register("gender", { required: "Gender is required" })} className={errors.gender ? "input-error" : ""}>
        <option value="">Select Gender</option>
        <option value="Male">Male</option>
        <option value="Female">Female</option>
        <option value="Other">Other</option>
      </select>
      {errors.gender && <span className="error">{errors.gender.message}</span>}

      {/* Civil Status */}
      <label htmlFor="civilStatus">Civil Status</label>
      <select id="civilStatus" {...register("civilStatus", { required: "Civil status is required" })} className={errors.civilStatus ? "input-error" : ""}>
        <option value="">Select Status</option>
        <option value="Single">Single</option>
        <option value="Married">Married</option>
        <option value="Widowed">Widowed</option>
        <option value="Separated">Separated</option>
      </select>
      {errors.civilStatus && <span className="error">{errors.civilStatus.message}</span>}

      {/* Contact Number */}
      <label htmlFor="contactNumber">Contact Number</label>
      <input id="contactNumber" {...register("contactNumber", { required: "Contact number is required", pattern: { value: /^09\d{9}$/, message: "Must be a valid PH mobile number" } })} className={errors.contactNumber ? "input-error" : ""} />
      {errors.contactNumber && <span className="error">{errors.contactNumber.message}</span>}

      {/* Email */}
      <label htmlFor="email">Email</label>
      <input id="email" type="email" {...register("email", { required: "Email is required" })} className={errors.email ? "input-error" : ""} />
      {errors.email && <span className="error">{errors.email.message}</span>}

            {/* Address */}
      <fieldset>
        <legend>Address</legend>

        <label htmlFor="houseNumber">House Number</label>
        <input
          id="houseNumber"
          {...register("houseNumber", { required: "House number is required" })}
          className={errors.houseNumber ? "input-error" : ""}
        />
        {errors.houseNumber && <span className="error">{errors.houseNumber.message}</span>}

        <label htmlFor="street">Street</label>
        <input
          id="street"
          {...register("street", { required: "Street is required" })}
          className={errors.street ? "input-error" : ""}
        />
        {errors.street && <span className="error">{errors.street.message}</span>}

        <label htmlFor="purok">Purok</label>
        <input
          id="purok"
          {...register("purok", { required: "Purok is required" })}
          className={errors.purok ? "input-error" : ""}
        />
        {errors.purok && <span className="error">{errors.purok.message}</span>}

        <label htmlFor="barangay">Barangay</label>
        <select
          id="barangay"
          {...register("barangay", { required: "Barangay is required" })}
          className={errors.barangay ? "input-error" : ""}
        >
          <option value="">Select Barangay</option>
          {Object.entries(PARANAQUE.districts || {}).map(([district, barangays]) => (
            <optgroup key={district} label={`District ${district}`}>
              {barangays.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {errors.barangay && <span className="error">{errors.barangay.message}</span>}

        <label htmlFor="city">City</label>
        <input id="city" value={PARANAQUE.city} readOnly {...register("city")} />

        <label htmlFor="province">Province</label>
        <input id="province" value={PARANAQUE.province} readOnly {...register("province")} />

        <label htmlFor="zipCode">Zip Code</label>
        <input id="zipCode" {...register("zipCode", { required: "Zip code is required" })} className={errors.zipCode ? "input-error" : ""} />
        {errors.zipCode && <span className="error">{errors.zipCode.message}</span>}
      </fieldset>

      {/* Head of Family */}
      <label htmlFor="isHeadOfFamily">Head of Family</label>
      <select
        id="isHeadOfFamily"
        {...register("isHeadOfFamily", { required: "Head of family selection is required" })}
        className={errors.isHeadOfFamily ? "input-error" : ""}
      >
        <option value="">Select</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
      {errors.isHeadOfFamily && <span className="error">{errors.isHeadOfFamily.message}</span>}

      {/* Voter Status */}
      <label htmlFor="voterStatus">Voter Status</label>
      <select
        id="voterStatus"
        {...register("voterStatus", { required: "Voter status is required" })}
        className={errors.voterStatus ? "input-error" : ""}
      >
        <option value="">Select</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
        <option value="unknown">Unknown</option>
      </select>
      {errors.voterStatus && <span className="error">{errors.voterStatus.message}</span>}

      {/* Occupation */}
      <label htmlFor="occupation">Occupation</label>
      <input id="occupation" {...register("occupation")} />

      {/* Remarks */}
      <label htmlFor="remarks">Remarks</label>
      <textarea id="remarks" {...register("remarks")} />

      {/* Photo */}
      <label htmlFor="photo">Photo (2×2 inches)</label>
      <input
        id="photo"
        type="file"
        accept="image/*"
        onChange={(e) => handleFileChange(e, setPhoto, "Photo")}
      />
      {photo.preview && (
        <div className="photo-preview-wrapper">
          <img src={photo.preview} alt={`Preview of ${fullName}`} className="photo-preview" />
          <button type="button" onClick={() => setPhoto({ file: null, preview: null })}>
            Remove
          </button>
        </div>
      )}

      {/* Left Thumb */}
      <label htmlFor="leftThumb">Left Thumb</label>
      <input
        id="leftThumb"
        type="file"
        accept="image/*"
        onChange={(e) => handleFileChange(e, setLeftThumb, "Left Thumb")}
      />
      {leftThumb.preview && (
        <div className="fingerprint-preview-wrapper">
          <img src={leftThumb.preview} alt={`Left thumb of ${fullName}`} className="fingerprint-preview" />
          <button type="button" onClick={() => setLeftThumb({ file: null, preview: null })}>
            Remove
          </button>
        </div>
      )}

      {/* Right Thumb */}
      <label htmlFor="rightThumb">Right Thumb</label>
      <input
        id="rightThumb"
        type="file"
        accept="image/*"
        onChange={(e) => handleFileChange(e, setRightThumb, "Right Thumb")}
      />
      {rightThumb.preview && (
        <div className="fingerprint-preview-wrapper">
          <img src={rightThumb.preview} alt={`Right thumb of ${fullName}`} className="fingerprint-preview" />
          <button type="button" onClick={() => setRightThumb({ file: null, preview: null })}>
            Remove
          </button>
        </div>
      )}

      {/* Signature input */}
      <SignatureField onChange={setSignatureDataUrl} onEmptyCheck={setIsSignatureEmpty} />

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Adding..." : "Add Resident"}
      </button>
      <button type="button" onClick={handleCancel} disabled={isSubmitting} style={{ marginLeft: "1rem" }}>
        Cancel
      </button>
    </form>
  );
};

export default ResidentForm;
