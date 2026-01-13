import React, { useState, useEffect, useMemo } from "react";
import { ROLE_PERMISSIONS, BASE_PERMISSIONS } from "../../config/roles";
import { SettingsAPI } from "../../services/api";   // ✅ use grouped API
import "../../styles/admin.css";

function SettingsPanel() {
  const [permissions, setPermissions] = useState({});
  const [fees, setFees] = useState({});
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const permissionKeys = useMemo(() => Object.keys(BASE_PERMISSIONS), []);

  // 🧠 Format error into readable string
  const formatError = (error) => {
    if (typeof error === "string") return error;
    if (error?.response?.data?.detail) return error.response.data.detail;
    if (typeof error?.response?.data === "string") return error.response.data;
    if (typeof error?.message === "string") return error.message;
    return JSON.stringify(error?.response?.data || error, null, 2);
  };

  // 🚀 Load permissions and fees
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [permData, feeData] = await Promise.all([
          SettingsAPI.getPermissions(),
          SettingsAPI.getFees(),
        ]);

        const mergedPermissions = Object.fromEntries(
          Object.entries(ROLE_PERMISSIONS).map(([role, defaults]) => [
            role.toLowerCase(),
            { ...defaults, ...(permData?.[role] || {}) },
          ])
        );

        setPermissions(mergedPermissions);
        setFees(feeData);
      } catch (error) {
        setErrorMessage(formatError(error));
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  // 🔐 Toggle permission for a role
  const handlePermissionToggle = async (role, key) => {
    if (role === "admin") return; // 🚫 Prevent admin override

    const current = permissions[role];
    const updated = { ...current, [key]: !current[key] };

    // rollback copy
    const prev = current;
    setPermissions((prevState) => ({ ...prevState, [role]: updated }));

    const permissionMap = Object.fromEntries(
      Object.entries(updated).map(([k, v]) => [k, !!v])
    );

    try {
      await SettingsAPI.updatePermissions(role, permissionMap);
      setErrorMessage("");
    } catch (error) {
      console.error("🔴 Permission update failed:", error.response?.data || error);
      setPermissions((prevState) => ({ ...prevState, [role]: prev })); // rollback
      setErrorMessage(`Failed to update ${role} permissions: ${formatError(error)}`);
    }
  };

  // 💰 Update fee for a document type
  const handleFeeChange = async (docType, newFee) => {
    const parsedFee = parseFloat(newFee);
    if (!Number.isFinite(parsedFee) || parsedFee < 0) {
      setErrorMessage("Fee must be a non-negative number.");
      return;
    }

    const updated = { ...fees, [docType]: parsedFee };
    setFees(updated);

    try {
      await SettingsAPI.updateFee(docType, parsedFee);
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(`Failed to update fee for ${docType}: ${formatError(error)}`);
    }
  };

  if (loading) return <p>Loading settings...</p>;

  return (
    <div className="settings-panel" aria-busy={loading} aria-live="polite">
      {errorMessage && <p className="error-message">{errorMessage}</p>}

      <h2>🔐 Role Permissions</h2>
      <table className="permissions-table">
        <thead>
          <tr>
            <th>Role</th>
            {permissionKeys.map((key) => (
              <th key={key}>{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(permissions).map(([role, perms]) => (
            <tr key={role}>
              <td>{role}</td>
              {permissionKeys.map((key) => (
                <td key={key}>
                  <input
                    type="checkbox"
                    checked={perms[key]}
                    disabled={role === "admin"}
                    onChange={() => handlePermissionToggle(role, key)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h2>💰 Document Fees</h2>
      <table className="fees-table">
        <thead>
          <tr>
            <th>Document Type</th>
            <th>Fee (₱)</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(fees).map(([docType, fee]) => (
            <tr key={docType}>
              <td>{docType}</td>
              <td>
                <input
                  type="number"
                  value={fee}
                  onChange={(e) => handleFeeChange(docType, e.target.value)}
                  min="0"
                  step="0.01"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SettingsPanel;
