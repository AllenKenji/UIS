import { useState } from "react";
import { useUser } from "../../context/UserContext";
import { api } from "../../services/api";
import { ROLE_OPTIONS } from "../../config/roles"; 
import "../../styles/admin.css";

const defaultForm = {
  full_name: "",
  email: "",
  password: "",
  role: "staff",
};

const CreateAccountForm = () => {
  const { getToken, isAdmin } = useUser();
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState("");

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => setForm(defaultForm);

  const validateForm = () => {
    if (!form.full_name.trim()) return "Full name is required.";
    if (!form.email.includes("@")) return "Invalid email address.";
    if (form.password.length < 6) return "Password must be at least 6 characters.";
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

      setFeedback(`✅ Account created: ${data.uid}`);
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
    >
      <h3>👤 Create Barangay Account</h3>

      {feedback && <p className="feedback">{feedback}</p>}

      <label>
        Full Name
        <input
          name="full_name"
          placeholder="Juan Dela Cruz"
          value={form.full_name}
          onChange={handleChange}
          required
        />
      </label>

      <label>
        Email
        <input
          name="email"
          type="email"
          placeholder="juan@example.com"
          value={form.email}
          onChange={handleChange}
          required
        />
      </label>

      <label>
        Password
        <input
          name="password"
          type="password"
          placeholder="••••••••"
          value={form.password}
          onChange={handleChange}
          required
        />
      </label>

      <label>
        Role
        <select name="role" value={form.role} onChange={handleChange}>
          {ROLE_OPTIONS.filter((opt) => isAdmin || opt.value !== "admin").map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

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
