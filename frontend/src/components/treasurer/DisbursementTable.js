import { useDisbursements } from "../../hooks/useDisbursements";

function DisbursementTable() {
  const { disbursements } = useDisbursements();

  const formatDate = (value) => {
    if (!value) return "-";

    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleDateString();
    }

    if (typeof value === "object" && Number.isFinite(value.seconds)) {
      return new Date(value.seconds * 1000).toLocaleDateString();
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString();
  };

  return (
    <div className="disbursement-table">
      <h2>Barangay Disbursements</h2>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Amount</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {disbursements.map(d => (
            <tr key={d.id}>
              <td>{d.category}</td>
              <td>₱{d.amount}</td>
              <td>{formatDate(d.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DisbursementTable;
