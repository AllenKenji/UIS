import "../styles/fee-dashboard.css";
import AddNewFeeForm from "../components/forms/AddNewFeeForm";
import FeeTable from "../components/admin/FeeTable";
import { useResolvedFees } from "../hooks/useResolvedFees";

export default function FeeDashboard() {
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
  } = useResolvedFees();

  const miscTypeOptions = [
    { value: "", label: "— None —" },
    ...miscFees.map(m => ({ value: m.miscType || m.id, label: m.miscType || m.id })),
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

  const renderFeeTable = (title, columns, data, onUpdate, onDelete) => (
    <FeeTable
      title={title}
      columns={columns}
      data={data}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  );

  return (
    <div className="fee-dashboard">
      <h1>⚙️ Admin Fee Dashboard</h1>

      {loading && <p className="loading">Loading fees...</p>}
      {error && <p className="error">{error}</p>}

      <AddNewFeeForm
        onAdded={refreshData}
        miscFees={miscFees}
        documentFees={documentFees}
        businessFees={businessFees}
      />

      {/* 📄 Document Fees */}
      {renderFeeTable(
        "📄 Document Fees",
        documentColumns,
        documentFees.map(doc => ({
          ...doc,
          miscUsage: "document",
          miscFeeValue: doc.miscFeeRate ?? 0,
          totalFee: getDocumentTotal(doc, "document"),
        })),
        (id, key, value, item) => {
          if (key === "miscType" || key === "miscFeeType" || key === "miscFeeValue") {
            return updateDocumentFee(id, item, key, value).then(refreshData);
          }
          return updateDocumentFee(id, item, key, value);
        },
        deleteDocumentFee
      )}

      {/* 🏢 Business Fees */}
      {renderFeeTable(
        "🏢 Business Fees",
        businessColumns,
        businessFees.map(biz => ({
          ...biz,
          miscUsage: "business",
          miscFeeValue: biz.miscFeeRate ?? 0,
          registrationTotal: getRegistrationTotal(biz, "business"),
          annualTotal: getAnnualTotal(biz, "business"),
        })),
        (id, key, value, item) => {
          if (key === "miscType" || key === "miscFeeType" || key === "miscFeeValue") {
            return updateBusinessFee(id, item, key, value).then(refreshData);
          }
          return updateBusinessFee(id, item, key, value);
        },
        deleteBusinessFee
      )}
    </div>
  );
}
