import { useEffect, useState } from "react";
import { useUser } from "../../context/UserContext";
import { api, PublicServicesAPI } from "../../services/api";
import { uploadLocalFile, uploadBase64Image } from "../../utils/fileUtils";
import { ROLE_OPTIONS } from "../../config/roles";
import SignatureField from "../forms/SignatureField";
import "../../styles/admin.css";

const defaultForm = {
  full_name: "",
  email: "",
  password: "",
  role: "staff",
  barangayId: "",
};

const CreateAccountForm = () => {
  const { getToken, isAdmin, isSuperAdmin } = useUser();
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState(null);
  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [tenants, setTenants] = useState([]);

  useEffect(() => {
    if (isSuperAdmin) {
      PublicServicesAPI.listTenants().then(setTenants).catch(() => setTenants([]));
    }
  }, [isSuperAdmin]);

  const handleChange = (e) => {
    const { name, value, dataset } = e.target;
    const field = dataset.field || name;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetForm = () => {
    setForm(defaultForm);
    setPhoto(null);
    setPhotoPreview("");
    setSignatureDataUrl(null);
    setSignatureEmpty(true);
  };

  const handlePhotoChange = (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setFeedback("❌ Profile photo must be an image.");
      return;
    }
    if (selected.size > 2 * 1024 * 1024) {
      setFeedback("❌ Profile photo must be 2 MB or smaller.");
      return;
    }
    setPhoto(selected);
    setPhotoPreview(URL.createObjectURL(selected));
  };

  const validateForm = () => {
    if (!form.full_name.trim()) return "Full name is required.";
    if (!form.email.includes("@")) return "Invalid email address.";
    if (form.password.length < 6) return "Password must be at least 6 characters.";
    if (isSuperAdmin && form.role !== "super_admin" && !form.barangayId) return "Please choose which barangay this account belongs to.";
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setFeedback(`❌ ${validationError}`);
      return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const { data } = await api.post("/api/admin/create-account", form, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let photoWarning = "";
      if (photo) {
        try {
          const extension = photo.name.split(".").pop() || "jpg";
          const uploaded = await uploadLocalFile(
            data.uid,
            photo,
            `accounts/${data.uid}/photo`,
            `profile.${extension}`
          );
          await api.patch(`/api/admin/accounts/${data.uid}/photo`, { photoUrl: uploaded.url });
        } catch (photoError) {
          console.error("Account photo upload failed:", photoError);
          photoWarning = " Profile photo was not uploaded.";
        }
      }

      let signatureWarning = "";
      const hasSignature = signatureDataUrl && !signatureEmpty;
      if (hasSignature) {
        try {
          const signatureUrl = await uploadBase64Image(data.uid, signatureDataUrl, "signatures");
          await api.patch(`/api/admin/accounts/${data.uid}/signature`, { signatureUrl });
        } catch (signatureError) {
          console.error("Account signature upload failed:", signatureError);
          signatureWarning = " Signature was not saved.";
        }
      }

      const extras = [
        photoWarning || (photo ? " with profile photo" : ""),
        signatureWarning || (hasSignature ? " with e-signature" : ""),
      ].filter(Boolean).join(",");
      setFeedback(`✅ Account created: ${data.uid}${extras}`);
      resetForm();
      setConfirming(false);
    } catch (error) {
      let errorMsg;

      if (error.response?.data) {
        const data = error.response.data;

        // Case 1: API returns { detail: "message" }
        if (typeof data.detail === "string") {
          errorMsg = data.detail;
        }
        // Case 2: API returns { detail: [{ msg: "error message", loc: [...] }] }
        else if (Array.isArray(data.detail)) {
          errorMsg = data.detail.map(err => err.msg || JSON.stringify(err)).join("; ");
        }
        // Fallback: stringify the whole response
        else {
          errorMsg = JSON.stringify(data);
        }
      } else {
        errorMsg = error.message;
      }

      console.error("❌ Account creation failed:", errorMsg);
      setFeedback(`❌ Failed to create account: ${errorMsg}`);
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className="create-account-form"
      onSubmit={handleSubmit}
      aria-busy={loading}
      aria-live="polite"
      autoComplete="off"
    >
      <h3>👤 Create Barangay Account</h3>

      {/* Decoy fields help prevent password managers from overriding actual inputs. */}
      <input type="text" name="username" autoComplete="username" tabIndex={-1} style={{ display: "none" }} />
      <input type="password" name="password" autoComplete="current-password" tabIndex={-1} style={{ display: "none" }} />

      {feedback && <p className="feedback">{feedback}</p>}

      <label>
        Full Name
        <input
          name="account_full_name"
          data-field="full_name"
          placeholder="Juan Dela Cruz"
          value={form.full_name}
          onChange={handleChange}
          required
          autoComplete="off"
        />
      </label>

      <label>
        Email
        <input
          name="account_email"
          data-field="email"
          type="email"
          placeholder="juan@example.com"
          value={form.email}
          onChange={handleChange}
          required
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </label>

      <label>
        Password
        <input
          name="account_password"
          data-field="password"
          type="password"
          placeholder="••••••••"
          value={form.password}
          onChange={handleChange}
          required
          autoComplete="new-password"
        />
      </label>

      <label>
        Role
        <select name="account_role" data-field="role" value={form.role} onChange={handleChange}>
          {ROLE_OPTIONS.filter((opt) => (isAdmin || isSuperAdmin) || opt.value !== "admin")
            .filter((opt) => isSuperAdmin || opt.value !== "super_admin")
            .map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
        </select>
      </label>

      {isSuperAdmin && form.role !== "super_admin" && (
        <label>
          Barangay
          <select name="account_barangay" data-field="barangayId" value={form.barangayId} onChange={handleChange} required>
            <option value="">Select a barangay</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.barangay}, {t.city}</option>
            ))}
          </select>
        </label>
      )}

      <label>
        Profile Photo <span aria-hidden="true">(optional)</span>
        <input type="file" accept="image/*" onChange={handlePhotoChange} />
      </label>

      {photoPreview && (
        <img
          src={photoPreview}
          alt="Selected account profile"
          style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 4 }}
        />
      )}

      <SignatureField
        label="E-Signature (optional) — attached to documents this account issues"
        onChange={setSignatureDataUrl}
        onEmptyCheck={setSignatureEmpty}
      />

      {(form.role === "surveyor" || form.role === "supervisor") && (
        <p className="feedback">ℹ️ This account will also be auto-created in CFDP.</p>
      )}

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={loading}
        >
          {loading ? "Creating…" : "Confirm & Create Account"}
        </button>
      ) : (
        <div className="confirm-actions">
          <p>
            Are you sure you want to create this account for{" "}
            <strong>{form.full_name}</strong>?
          </p>
          <button type="submit" className="btn-success" disabled={loading}>
            ✅ Yes, Create
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => setConfirming(false)}
            disabled={loading}
          >
            ❌ Cancel
          </button>
        </div>
      )}
    </form>
  );
};

export default CreateAccountForm;
