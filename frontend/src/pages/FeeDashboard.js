import "../styles/fee-dashboard.css";
import AddNewFeeForm from "../components/forms/AddNewFeeForm";
import FeeTable from "../components/admin/FeeTable";
import { useResolvedFees } from "../hooks/useResolvedFees";
import {
  buildDocumentPayload,
  buildBusinessPayload,
  buildMiscPayload,
} from "../utils/payloadBuilders";


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
    getTotalFee, // ✅ now available from useResolvedFees
  } = useResolvedFees();

  // 🔧 Column definitions
  const documentColumns = [
    { key: "documentType", label: "Document Type", editable: false },
    { key: "fee", label: "Fee (₱)", editable: true },
    { key: "enabled", label: "Enabled", editable: true, type: "checkbox" },
    { key: "miscType", label: "Misc Type", editable: false },
    { key: "miscFeeResolved", label: "Misc Fee (₱)", editable: false },
    { key: "totalFee", label: "Total Fee (₱)", editable: false }, // ✅ new column
  ];

  const businessColumns = [
    { key: "businessType", label: "Business Type", editable: false },
    { key: "fee", label: "Base Fee (₱)", editable: true },
    { key: "registrationFee", label: "Registration Fee (₱)", editable: true },
    { key: "annualFee", label: "Annual Fee (₱)", editable: true },
    { key: "enabled", label: "Enabled", editable: true, type: "checkbox" },
    { key: "miscType", label: "Misc Type", editable: false },
    { key: "miscFeeResolved", label: "Misc Fee (₱)", editable: false },
    { key: "totalFee", label: "Total Fee (₱)", editable: false }, // ✅ new column
  ];

  const miscColumns = [
    { key: "miscType", label: "Misc Type", editable: false },
    { key: "fee", label: "Fee (₱)", editable: true },
    { key: "enabled", label: "Enabled", editable: true, type: "checkbox" },
  ];

  // 🔧 Reusable renderer for FeeTable
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
          totalFee: getTotalFee(doc, "document"),
        })),
        (id, key, value, item) => updateDocumentFee(id, buildDocumentPayload(item, key, value)),
        deleteDocumentFee
      )}

      {/* 🏢 Business Fees */}
      {renderFeeTable(
        "🏢 Business Fees",
        businessColumns,
        businessFees.map(biz => ({
          ...biz,
          totalFee: getTotalFee(biz, "business"),
        })),
        (id, key, value, item) => updateBusinessFee(id, buildBusinessPayload(item, key, value)),
        deleteBusinessFee
      )}

      {/* 🆕 Miscellaneous Fees */}
      {renderFeeTable(
        "🆕 Miscellaneous Fees",
        miscColumns,
        miscFees,
        (id, key, value, item) => updateMiscFee(id, buildMiscPayload(item, key, value)),
        deleteMiscFee
      )}
    </div>
  );
}
