import { useState } from "react";
import FeeTable from "../../components/admin/FeeTable";
import { useResolvedFees } from "../../hooks/useResolvedFees";
import { useTenants } from "../../hooks/useTenants";
import "../../styles/fee-dashboard.css";

export default function SettingsPage() {
  const { tenants } = useTenants();
  const [barangayId, setBarangayId] = useState("");

  const {
    documentFees,
    businessFees,
    miscFees,
    loading,
    error,
    refreshData,
    updateDocumentFee,
    updateBusinessFee,
    deleteDocumentFee,
    deleteBusinessFee,
    getRegistrationTotal,
    getAnnualTotal,
    getDocumentTotal,
  } = useResolvedFees({ barangayId, enabled: !!barangayId });

  const miscTypeOptions = [
    { value: "", label: "— None —" },
    ...miscFees.map((m) => ({ value: m.miscType || m.id, label: m.miscType || m.id })),
  ];

  const documentColumns = [
    { key: "documentType", label: "Document Type", editable: false },
    { key: "fee", label: "Fee (₱)", editable: true },
    { key: "enabled", label: "Enabled", editable: true, type: "checkbox" },
    { key: "miscType", label: "Misc Type", editable: true, type: "select", options: miscTypeOptions },
    { key: "miscFeeType", label: "Fee Calculation", editable: true, type: "select", defaultValue: "fixed", options: [
      { value: "fixed", label: "Fixed amount" },
      { value: "percentage", label: "Percentage" },
    ] },
    { key: "miscFeeValue", label: "Misc Fee Value", editable: true, type: "number" },
    { key: "totalFee", label: "Total Fee (₱)", editable: false },
    { key: "validityDays", label: "Validity (days)", editable: true, type: "number" },
  ];

  const businessColumns = [
    { key: "businessType", label: "Business Type", editable: false },
    { key: "fee", label: "Base Fee (₱)", editable: true },
    { key: "registrationFee", label: "Registration Fee (₱)", editable: true },
    { key: "annualFee", label: "Annual Fee (₱)", editable: true },
    { key: "enabled", label: "Enabled", editable: true, type: "checkbox" },
    { key: "miscType", label: "Misc Type", editable: true, type: "select", options: miscTypeOptions },
    { key: "miscFeeType", label: "Fee Calculation", editable: true, type: "select", defaultValue: "fixed", options: [
      { value: "fixed", label: "Fixed amount" },
      { value: "percentage", label: "Percentage" },
    ] },
    { key: "miscFeeValue", label: "Misc Fee Value", editable: true, type: "number" },
    { key: "registrationTotal", label: "Registration Total (₱)", editable: false },
    { key: "annualTotal", label: "Annual Total (₱)", editable: false },
  ];

  return (
    <div className="fee-dashboard">
      <h1>⚙️ Barangay Document &amp; Business Settings</h1>
      <div className="fee-section">
        <label>
          Select a barangay to view/override its settings{" "}
          <select value={barangayId} onChange={(e) => setBarangayId(e.target.value)}>
            <option value="">Select a barangay</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.barangay} ({t.city})</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <p className="loading">Loading fees...</p>}

      {!barangayId && <p className="loading">Pick a barangay above to view and edit its fee settings.</p>}

      {barangayId && !loading && (
        <>
          <FeeTable
            title="📄 Document Fees"
            columns={documentColumns}
            data={documentFees.map((doc) => ({
              ...doc,
              miscUsage: "document",
              miscFeeValue: doc.miscFeeRate ?? 0,
              totalFee: getDocumentTotal(doc, "document"),
            }))}
            onUpdate={(id, key, value, item) => {
              if (key === "miscType" || key === "miscFeeType" || key === "miscFeeValue") {
                return updateDocumentFee(id, item, key, value).then(refreshData);
              }
              return updateDocumentFee(id, item, key, value);
            }}
            onDelete={deleteDocumentFee}
          />

          <FeeTable
            title="🏢 Business Fees"
            columns={businessColumns}
            data={businessFees.map((biz) => ({
              ...biz,
              miscUsage: "business",
              miscFeeValue: biz.miscFeeRate ?? 0,
              registrationTotal: getRegistrationTotal(biz, "business"),
              annualTotal: getAnnualTotal(biz, "business"),
            }))}
            onUpdate={(id, key, value, item) => {
              if (key === "miscType" || key === "miscFeeType" || key === "miscFeeValue") {
                return updateBusinessFee(id, item, key, value).then(refreshData);
              }
              return updateBusinessFee(id, item, key, value);
            }}
            onDelete={deleteBusinessFee}
          />
        </>
      )}
    </div>
  );
}
