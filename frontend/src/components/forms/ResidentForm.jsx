import { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { ResidentsAPI, PublicServicesAPI } from "../../services/api";
import { toast } from "react-toastify";
import SignatureField from "./SignatureField";
import CameraCapture from "../common/CameraCapture";
import { uploadFile, uploadBase64Image, uploadThumbprint } from "../../utils/fileUtils";
import { PARANAQUE } from "../../data/locations";
import { cleanPayload } from "../../utils/cleanPayload";
import "./resident-form.css";

const getAuthUid = (currentUser) => {
  const uid = currentUser?.uid;
  if (!uid) throw new Error("Missing local auth UID. User may not be authenticated.");
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
  const [tenant, setTenant] = useState(null);

  const birthDate = watch("birthDate");
  const fullName = watch("fullName");
  const age = birthDate ? calculateAge(birthDate) : "";

  useEffect(() => {
    if (!user?.barangayId) return;
    PublicServicesAPI.getTenant(user.barangayId)
      .then(setTenant)
      .catch(() => setTenant(null));
  }, [user?.barangayId]);

  const barangayName = tenant?.barangay || "";
  const cityName = tenant?.city || PARANAQUE.city;
  const provinceName = tenant?.province || PARANAQUE.province;

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
    const uid = getAuthUid(user);

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

      if (!data.email?.trim() && !data.contactNumber?.trim()) {
        toast.error("❌ Provide either an email address or a Philippine mobile number for resident login.");
        return;
      }

      const existing = await ResidentsAPI.findByNameAndBirthDate(data.fullName, data.birthDate);
      if (existing?.length) {
        toast.error("❌ Duplicate resident detected!");
        return;
      }

      const payload = await buildPayload(data);

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

      toast.success(payload.email ? "✅ Resident added. Welcome email will be sent." : "✅ Resident added. Use the contact number to log in.");
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
      <div className="field">
        <label htmlFor="fullName">Full Name</label>
        <input id="fullName" {...register("fullName", { required: "Full name is required" })} className={errors.fullName ? "input-error" : ""} />
        {errors.fullName && <span className="error">{errors.fullName.message}</span>}
      </div>

      {/* Birth Date */}
      <div className="field">
        <label htmlFor="birthDate">Birth Date {age && <span>(Age: {age})</span>}</label>
        <input id="birthDate" type="date" {...register("birthDate", { required: "Birth date is required" })} className={errors.birthDate ? "input-error" : ""} />
        {errors.birthDate && <span className="error">{errors.birthDate.message}</span>}
      </div>

      {/* Gender */}
      <div className="field">
        <label htmlFor="gender">Gender</label>
        <select id="gender" {...register("gender", { required: "Gender is required" })} className={errors.gender ? "input-error" : ""}>
          <option value="">Select Gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Other">Other</option>
        </select>
        {errors.gender && <span className="error">{errors.gender.message}</span>}
      </div>

      {/* Civil Status */}
      <div className="field">
        <label htmlFor="civilStatus">Civil Status</label>
        <select id="civilStatus" {...register("civilStatus", { required: "Civil status is required" })} className={errors.civilStatus ? "input-error" : ""}>
          <option value="">Select Status</option>
          <option value="Single">Single</option>
          <option value="Married">Married</option>
          <option value="Widowed">Widowed</option>
          <option value="Separated">Separated</option>
        </select>
        {errors.civilStatus && <span className="error">{errors.civilStatus.message}</span>}
      </div>

      {/* Contact Number */}
      <div className="field">
        <label htmlFor="contactNumber">Contact Number <span>(required when email is blank)</span></label>
        <input id="contactNumber" {...register("contactNumber", { pattern: { value: /^$|^09\d{9}$/, message: "Must be a valid PH mobile number" } })} className={errors.contactNumber ? "input-error" : ""} />
        {errors.contactNumber && <span className="error">{errors.contactNumber.message}</span>}
      </div>

      {/* Email */}
      <div className="field">
        <label htmlFor="email">Email <span>(required when contact number is blank)</span></label>
        <input id="email" type="email" {...register("email")} className={errors.email ? "input-error" : ""} />
        {errors.email && <span className="error">{errors.email.message}</span>}
      </div>

      {/* Address */}
      <fieldset className="field-full">
        <legend>Address</legend>

        <div className="field">
          <label htmlFor="houseNumber">House Number</label>
          <input
            id="houseNumber"
            {...register("houseNumber", { required: "House number is required" })}
            className={errors.houseNumber ? "input-error" : ""}
          />
          {errors.houseNumber && <span className="error">{errors.houseNumber.message}</span>}
        </div>

        <div className="field">
          <label htmlFor="street">Street</label>
          <input
            id="street"
            {...register("street", { required: "Street is required" })}
            className={errors.street ? "input-error" : ""}
          />
          {errors.street && <span className="error">{errors.street.message}</span>}
        </div>

        <div className="field">
          <label htmlFor="purok">Purok (optional)</label>
          <input
            id="purok"
            {...register("purok")}
            className={errors.purok ? "input-error" : ""}
          />
          {errors.purok && <span className="error">{errors.purok.message}</span>}
        </div>

        <div className="field">
          <label htmlFor="barangay">Barangay</label>
          <input
            id="barangay"
            value={barangayName}
            placeholder="Loading barangay…"
            readOnly
            {...register("barangay", { required: "Barangay is required" })}
          />
          {errors.barangay && <span className="error">{errors.barangay.message}</span>}
        </div>

        <div className="field">
          <label htmlFor="city">City</label>
          <input id="city" value={cityName} readOnly {...register("city")} />
        </div>

        <div className="field">
          <label htmlFor="province">Province</label>
          <input id="province" value={provinceName} readOnly {...register("province")} />
        </div>

        <div className="field">
          <label htmlFor="zipCode">Zip Code</label>
          <input id="zipCode" {...register("zipCode", { required: "Zip code is required" })} className={errors.zipCode ? "input-error" : ""} />
          {errors.zipCode && <span className="error">{errors.zipCode.message}</span>}
        </div>
      </fieldset>

      {/* Head of Family */}
      <div className="field">
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
      </div>

      {/* Voter Status */}
      <div className="field">
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
      </div>

      {/* Occupation */}
      <div className="field">
        <label htmlFor="occupation">Occupation</label>
        <input id="occupation" {...register("occupation")} />
      </div>

      {/* Remarks */}
      <div className="field">
        <label htmlFor="remarks">Remarks</label>
        <textarea id="remarks" {...register("remarks")} />
      </div>

      {/* Photo */}
      <div className="field field-full">
        <label htmlFor="photo">Photo (2×2 inches)</label>
        {photo.preview ? (
          <div className="photo-preview-wrapper">
            <img src={photo.preview} alt={`Preview of ${fullName}`} className="photo-preview" />
            <button type="button" onClick={() => setPhoto({ file: null, preview: null })}>
              Retake / Remove
            </button>
          </div>
        ) : (
          <>
            <CameraCapture
              onCapture={(file) => setPhoto({ file, preview: URL.createObjectURL(file) })}
              facingMode="user"
              label="Take Photo with Camera"
            />
            <span>— or —</span>
            <input
              id="photo"
              type="file"
              accept="image/*"
              onChange={(e) => handleFileChange(e, setPhoto, "Photo")}
            />
          </>
        )}
      </div>

      {/* Left Thumb */}
      <div className="field">
        <label htmlFor="leftThumb">Left Thumb <span>(optional)</span></label>
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
      </div>

      {/* Right Thumb */}
      <div className="field">
        <label htmlFor="rightThumb">Right Thumb <span>(optional)</span></label>
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
      </div>

      {/* Signature input */}
      <div className="field field-full">
        <SignatureField onChange={setSignatureDataUrl} onEmptyCheck={setIsSignatureEmpty} />
      </div>

      <div className="field-full form-actions">
        <button type="submit" disabled={isSubmitting || !tenant}>
          {isSubmitting ? "Adding..." : !tenant ? "Loading barangay…" : "Add Resident"}
        </button>
        <button type="button" onClick={handleCancel} disabled={isSubmitting}>
          Cancel
        </button>
      </div>
    </form>
  );
};

export default ResidentForm;
