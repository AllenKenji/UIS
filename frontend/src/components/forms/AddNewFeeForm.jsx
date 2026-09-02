import { useState } from "react";
import { api } from "../../services/api";
import "./add-new-fee-form.css";
import { validateFeePayload } from "../../utils/validation";
import modesConfig from "../../config/modesConfig"; 

export default function AddNewFeeForm({ onAdded, miscFees = [], documentFees = [], businessFees = [] }) {
  const [mode, setMode] = useState("document");
  const [formData, setFormData] = useState({
    useForDocuments: false,
    documentFeeType: "fixed",
    documentFee: 0,
    useForBusinesses: false,
    businessFeeType: "fixed",
    businessFee: 0,
    enabled: true,
  });

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const buildPayload = () => {
    const payload = { ...formData };

    // Attach miscType reference only if enabled
    if ((mode === "document" || mode === "business") && payload.enabled) {
      payload.miscType = payload.miscType ?? null;
      payload.miscFeeType = payload.miscType ? payload.miscFeeType || null : null;
    } else {
      delete payload.miscType; // ensure it's not sent when disabled
      delete payload.miscFeeType;
    }

    return payload;
  };

  const handleSubmit = async () => {
    try {
      const payload = buildPayload();

      const { valid, message } = validateFeePayload(mode, payload);
      if (!valid) {
        alert(message);
        return;
      }

      console.log("Submitting payload:", payload);

      await api.post(modesConfig[mode].endpoint, payload);

      alert("✅ Fee saved!");
      onAdded?.();
      setFormData({
        useForDocuments: false,
        documentFeeType: "fixed",
        documentFee: 0,
        useForBusinesses: false,
        businessFeeType: "fixed",
        businessFee: 0,
        enabled: true,
      });
    } catch (err) {
      console.error("❌ Fee submission failed:", err);
      alert("❌ Failed to save fee");
    }
  };

  const renderField = (field) => {
    const value =
      formData[field.name] ??
      (field.type === "checkbox" ? false : field.type === "number" ? 0 : "");

    switch (field.type) {
      case "checkbox":
        return (
          <label key={field.name}>
            {field.label}:
            <input
              type="checkbox"
              checked={!!value}
              onChange={e => handleChange(field.name, e.target.checked)}
            />
          </label>
        );

      case "number":
        return (
          <label key={field.name}>
            {field.label}:
            <input
              type="number"
              min="0"
              step="any"
              value={value}
              onChange={e => handleChange(field.name, Number(e.target.value))}
            />
          </label>
        );

      case "select":
                if (field.name === "targetName") {
                  const targets = formData.targetType === "document" ? documentFees : businessFees;
                  return (
                    <label key={field.name}>
                      {field.label}:
                      <select value={value} onChange={e => handleChange(field.name, e.target.value)}>
                        <option value="">-- choose --</option>
                        {targets.map(target => {
                          const name = formData.targetType === "document" ? target.documentType : target.businessType;
                          return <option key={target.id} value={name}>{name}</option>;
                        })}
                      </select>
                    </label>
                  );
                }

        // Special handling for miscType dropdown
        if (field.name === "miscType") {
          // ✅ Only show miscType if enabled and mode is document/business
          if ((mode === "document" || mode === "business") && formData.enabled) {
            return (
              <label key={field.name}>
                {field.label}:
                <select
                  value={value}
                  onChange={e => handleChange(field.name, e.target.value)}
                >
                  <option value="">-- choose --</option>
                  {miscFees.map(m => (
                    <option key={m.id} value={m.miscType}>
                      {m.miscType} (₱{m.fee})
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          return null; // hide miscType when not enabled
        }

        if (field.name === "miscFeeType") {
          if ((mode === "document" || mode === "business") && formData.enabled && formData.miscType) {
            return (
              <label key={field.name}>
                {field.label}:
                <select
                  value={value || "fixed"}
                  onChange={e => handleChange(field.name, e.target.value)}
                >
                  {(field.options || []).map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          return null;
        }

        // Fallback for other select fields
        return (
          <label key={field.name}>
            {field.label}:
            <select
              value={value}
              onChange={e => handleChange(field.name, e.target.value)}
            >
              <option value="">-- choose --</option>
              {(field.options || []).map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        );

      default:
        return (
          <label key={field.name}>
            {field.label}:
            <input
              type={field.type}
              value={value}
              onChange={e => handleChange(field.name, e.target.value)}
            />
          </label>
        );
    }
  };

  return (
    <div className="add-fee-form">
      <h2>Add New Fee</h2>
      <div>
        <label>
          Mode:
          <select value={mode} onChange={e => setMode(e.target.value)}>
            {Object.keys(modesConfig).map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Dynamic fields */}
      {modesConfig[mode].fields.map(renderField)}

      <button onClick={handleSubmit}>Save</button>
    </div>
  );
}
