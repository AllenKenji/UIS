import { useState } from "react";
import { toast } from "react-toastify";
import { useUser } from "../context/UserContext";
import SignatureField from "../components/forms/SignatureField";
import { AccountsAPI } from "../services/api";
import { uploadBase64Image } from "../utils/fileUtils";
import "./my-signature.css";

export default function MySignaturePage() {
  const { userInfo, updateUserInfo } = useUser();
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [saving, setSaving] = useState(false);
  const existingSignature = userInfo?.signatureUrl || userInfo?.signature_url;

  const handleSave = async () => {
    if (isEmpty || !signatureDataUrl) {
      toast.error("❌ Please draw your signature first.");
      return;
    }
    setSaving(true);
    try {
      const signatureUrl = await uploadBase64Image(userInfo.uid, signatureDataUrl, "signatures");
      const result = await AccountsAPI.updateMySignature(signatureUrl);
      // Keep the session's cached profile in sync so the new signature is
      // reflected immediately without requiring a re-login.
      updateUserInfo({ ...userInfo, signatureUrl: result.signatureUrl });
      toast.success("✅ Signature saved. It will now be attached to documents you issue.");
      setSignatureDataUrl(null);
    } catch (err) {
      console.error("❌ Failed to save signature:", err);
      toast.error(err.response?.data?.detail || "❌ Failed to save signature.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="my-signature-page">
      <h1>✍️ My E-Signature</h1>
      <p>
        Draw your signature below. Once saved, it will automatically be attached to documents you issue
        as barangay staff — you don't need to sign each one individually.
      </p>

      {existingSignature && (
        <div className="signature-current">
          <h3>Current Signature</h3>
          <img src={existingSignature} alt="Your current signature" />
        </div>
      )}

      <SignatureField
        label={existingSignature ? "Draw a new signature to replace it" : "Draw your signature"}
        onChange={setSignatureDataUrl}
        onEmptyCheck={setIsEmpty}
      />

      <button type="button" onClick={handleSave} disabled={saving || isEmpty}>
        {saving ? "Saving..." : "Save Signature"}
      </button>
    </div>
  );
}
