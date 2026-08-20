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
    updateMiscFee,
    deleteDocumentFee,
    deleteBusinessFee,
    deleteMiscFee,
    getRegistrationTotal,
    getAnnualTotal,
    getDocumentTotal,
  } = useResolvedFees();

  const documentColumns = [
    { key: "documentType", label: "Document Type", editable: false },
    { key: "fee", label: "Fee (₱)", editable: true },
    { key: "enabled", label: "Enabled", editable: true, type: "checkbox" },
    { key: "miscType", label: "Misc Type", editable: false },
    { key: "miscFeeType", label: "Misc Calculation", editable: true, type: "select", options: [
      { value: "fixed", label: "Fixed amount" },
      { value: "percentage", label: "Percentage" },
    ] },
    { key: "miscFeeResolved", label: "Misc Fee (₱)", editable: false },
    { key: "totalFee", label: "Total Fee (₱)", editable: false }, 
  ];

  const businessColumns = [
    { key: "businessType", label: "Business Type", editable: false },
    { key: "fee", label: "Base Fee (₱)", editable: true },
    { key: "registrationFee", label: "Registration Fee (₱)", editable: true },
    { key: "annualFee", label: "Annual Fee (₱)", editable: true },
    { key: "enabled", label: "Enabled", editable: true, type: "checkbox" },
    { key: "miscType", label: "Misc Type", editable: false },
    { key: "miscFeeType", label: "Misc Calculation", editable: true, type: "select", options: [
      { value: "fixed", label: "Fixed amount" },
      { value: "percentage", label: "Percentage" },
    ] },
    { key: "miscFeeResolved", label: "Misc Fee (₱)", editable: false },
    { key: "registrationTotal", label: "Registration Total (₱)", editable: false },
    { key: "annualTotal", label: "Annual Total (₱)", editable: false },
  ];

  const miscColumns = [
    { key: "miscType", label: "Misc Type", editable: false },
    { key: "feeType", label: "Fee Calculation", editable: true, type: "select", options: [
      { value: "fixed", label: "Fixed amount" },
      { value: "percentage", label: "Percentage" },
    ] },
    { key: "fee", label: "Value", editable: true },
    { key: "enabled", label: "Enabled", editable: true, type: "checkbox" },
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

      <AddNewFeeForm onAdded={refreshData} miscFees={miscFees} />

      {/* 📄 Document Fees */}
      {renderFeeTable(
        "📄 Document Fees",
        documentColumns,
        documentFees.map(doc => ({
          ...doc,
          totalFee: getDocumentTotal(doc, "document"),
        })),
        (id, key, value, item) => updateDocumentFee(id, item, key, value),
        deleteDocumentFee
      )}

      {/* 🏢 Business Fees */}
      {renderFeeTable(
        "🏢 Business Fees",
        businessColumns,
        businessFees.map(biz => ({
          ...biz,
          registrationTotal: getRegistrationTotal(biz, "business"),
          annualTotal: getAnnualTotal(biz, "business"),
        })),
        (id, key, value, item) => updateBusinessFee(id, item, key, value),
        deleteBusinessFee
      )}

      {/* 🆕 Miscellaneous Fees */}
      {renderFeeTable(
        "🆕 Miscellaneous Fees",
        miscColumns,
        miscFees,
        (id, key, value, item) => updateMiscFee(id, item, key, value),
        deleteMiscFee
      )}
    </div>
  );
}
