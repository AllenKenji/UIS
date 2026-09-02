import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PublicServicesAPI } from "../services/api";
import CameraCapture from "../components/common/CameraCapture";
import SignatureField from "../components/forms/SignatureField";
import PublicBackBar from "../components/public/PublicBackBar";
import "./public-services.css";

function dataUrlToFile(dataUrl, filename) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}

const initialForm = {
  fullName: "",
  birthDate: "",
  gender: "",
  civilStatus: "",
  email: "",
  contactNumber: "",
  houseNumber: "",
  street: "",
  purok: "",
  isHeadOfFamily: "false",
  voterStatus: "unknown",
  occupation: "",
};

export default function PublicResidentRegistration() {
  const { barangayId } = useParams();
  const [tenant, setTenant] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [governmentId, setGovernmentId] = useState(null);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [isSignatureEmpty, setIsSignatureEmpty] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  useEffect(() => {
    PublicServicesAPI.getTenant(barangayId)
      .then(setTenant)
      .catch(() => setNotFound(true));
  }, [barangayId]);

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  if (notFound) return <Navigate to="/" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (!photo) {
      setError("Please take or upload a photo of yourself to continue.");
      return;
    }
    if (!governmentId) {
      setError("Please upload a government ID, proof of identification, or proof of billing to continue.");
      return;
    }
    if (isSignatureEmpty || !signatureDataUrl) {
      setError("Please provide your signature to continue.");
      return;
    }

    setLoading(true);
    try {
      const payload = new FormData();
      payload.append("barangayId", barangayId);
      payload.append("fullName", form.fullName);
      payload.append("birthDate", form.birthDate);
      payload.append("gender", form.gender);
      payload.append("civilStatus", form.civilStatus);
      payload.append("email", form.email);
      if (form.contactNumber) payload.append("contactNumber", form.contactNumber);
      payload.append("houseNumber", form.houseNumber);
      payload.append("street", form.street);
      if (form.purok) payload.append("purok", form.purok);
      payload.append("barangay", tenant?.barangay || "");
      payload.append("city", tenant?.city || "");
      payload.append("province", tenant?.province || "");
      if (tenant?.zipCode) payload.append("zipCode", tenant.zipCode);
      payload.append("isHeadOfFamily", form.isHeadOfFamily);
      payload.append("voterStatus", form.voterStatus);
      if (form.occupation) payload.append("occupation", form.occupation);
      payload.append("photo", photo);
      payload.append("governmentId", governmentId);
      payload.append("signature", dataUrlToFile(signatureDataUrl, "signature.png"));

      const data = await PublicServicesAPI.register(payload);
      setResult(data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Registration could not be completed.");
    } finally { setLoading(false); }
  };

  if (result) {
    return (
      <main className="public-services">
        <PublicBackBar barangayId={barangayId} />
        <section className="public-card">
          <h1>Registration Submitted</h1>
          <p>
            Your resident profile is saved and is now <strong>pending verification</strong> by barangay staff. Please
            visit or contact the barangay office (bring a valid ID) so staff can verify your registration — once
            verified, you'll be able to avail of Barangay services using your registered email address or mobile
            number (and birth date).
          </p>
          <Link className="public-link" to={`/b/${barangayId}/public-services`}>Check My Status / Access Barangay Services</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="public-services">
      <PublicBackBar barangayId={barangayId} />
      <section className="public-card">
        <h1>Barangay Services Registration</h1>
        <p>{tenant ? `Register with Barangay ${tenant.barangay}, ${tenant.city}.` : "Loading barangay..."} No account or password needed. A staff member will verify your registration before you can avail of services.</p>
        {error && <p className="public-error">{error}</p>}
        <form onSubmit={submit} className="public-form">
          <label>Full Name<input name="fullName" value={form.fullName} onChange={update} required /></label>
          <label>Birth Date<input type="date" name="birthDate" value={form.birthDate} onChange={update} required /></label>
          <label>Gender<select name="gender" value={form.gender} onChange={update} required><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>
          <label>Civil Status<select name="civilStatus" value={form.civilStatus} onChange={update} required><option value="">Select</option><option>Single</option><option>Married</option><option>Widowed</option><option>Separated</option></select></label>
          <label>Email<input type="email" name="email" value={form.email} onChange={update} required /></label>
          <label>Mobile Number <span>(optional)</span><input name="contactNumber" value={form.contactNumber} onChange={update} placeholder="09171234567" pattern="09[0-9]{9}" /></label>

          <fieldset>
            <legend>Address</legend>
            <label>House Number<input name="houseNumber" value={form.houseNumber} onChange={update} required /></label>
            <label>Street<input name="street" value={form.street} onChange={update} required /></label>
            <label>Purok <span>(optional)</span><input name="purok" value={form.purok} onChange={update} /></label>
            <label>Barangay<input value={tenant?.barangay || ""} readOnly /></label>
            <label>City<input value={tenant?.city || ""} readOnly /></label>
            <label>Province<input value={tenant?.province || ""} readOnly /></label>
            <label>Zip Code<input value={tenant?.zipCode || ""} readOnly placeholder="Not set by barangay yet" /></label>
          </fieldset>

          <fieldset>
            <legend>Other Details</legend>
            <label>Head of Family<select name="isHeadOfFamily" value={form.isHeadOfFamily} onChange={update}><option value="true">Yes</option><option value="false">No</option></select></label>
            <label>Voter Status<select name="voterStatus" value={form.voterStatus} onChange={update}><option value="yes">Yes</option><option value="no">No</option><option value="unknown">Unknown</option></select></label>
            <label>Occupation <span>(optional)</span><input name="occupation" value={form.occupation} onChange={update} /></label>
          </fieldset>

          <fieldset>
            <legend>Identity Verification</legend>

            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8 }}>
              <strong>Your Photo</strong>
              {photoPreview ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <img
                    src={photoPreview}
                    alt="Photo preview"
                    style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8, border: "1px solid #9eb6aa" }}
                  />
                  <button type="button" onClick={() => setPhoto(null)}>Retake / Choose Another</button>
                </div>
              ) : (
                <>
                  <CameraCapture onCapture={setPhoto} facingMode="user" label="Take Photo with Camera" />
                  <span>— or —</span>
                  <label>
                    Upload a photo instead
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setPhoto(event.target.files?.[0] || null)}
                    />
                  </label>
                </>
              )}
            </div>

            <label style={{ gridColumn: "1 / -1" }}>
              Government ID / Proof of Identification / Proof of Billing
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                onChange={(event) => setGovernmentId(event.target.files?.[0] || null)}
                required
              />
            </label>

            <div style={{ gridColumn: "1 / -1" }}>
              <SignatureField
                label="Your Signature"
                onChange={setSignatureDataUrl}
                onEmptyCheck={setIsSignatureEmpty}
              />
            </div>
          </fieldset>

          <button type="submit" disabled={loading || !tenant}>{loading ? "Registering..." : "Register"}</button>
        </form>
      </section>
    </main>
  );
}
