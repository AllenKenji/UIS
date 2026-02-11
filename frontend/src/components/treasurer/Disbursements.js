import React from "react";
import { useDisbursements } from "../../hooks/useDisbursements";

function Disbursements() {
  const { disbursements } = useDisbursements();

  return (
    <div className="treasurer-main">
      <h1>Disbursements</h1>
      <ul>
        {disbursements.map(d => (
          <li key={d.id}>
            {d.category} — ₱{d.amount} ({d.date})
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Disbursements;
