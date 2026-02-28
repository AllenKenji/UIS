import { useDisbursements } from "../../hooks/useDisbursements";

function DisbursementTable() {
  const { disbursements } = useDisbursements();

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
              <td>{d.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DisbursementTable;
