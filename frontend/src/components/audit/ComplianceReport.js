import "../../styles/admin.css";

const mockCompliance = [
  { id: 1, category: "Resident Registry", status: "Compliant", lastAudit: "Oct 15, 2025" },
  { id: 2, category: "Document Logs", status: "Pending Review", lastAudit: "Oct 10, 2025" },
];

const ComplianceReport = () => (
  <div className="compliance-report">
    <h3>📑 Compliance Summary</h3>
    <ul>
      {mockCompliance.map((item) => (
        <li key={item.id}>
          <strong>{item.category}</strong>: {item.status} <br />
          <small>Last audited: {item.lastAudit}</small>
        </li>
      ))}
    </ul>
  </div>
);

export default ComplianceReport;
