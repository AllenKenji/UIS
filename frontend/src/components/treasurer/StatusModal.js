import { useState } from "react";
import { DisbursementsAPI } from "../../services/api";

function StatusModal({ disbursement, onClose }) {
  const [status, setStatus] = useState(disbursement.status || "pending");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await DisbursementsAPI.patchStatus(disbursement.id, { status });
      onClose();
    } catch (err) {
      console.error("Failed to update status", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Update Status</h2>
        <p><strong>Reference:</strong> {disbursement.referenceNo || disbursement.id}</p>
        <p><strong>Category:</strong> {disbursement.category}</p>
        <p><strong>Amount:</strong> ₱{disbursement.amount?.toLocaleString()}</p>

        <label>
          Status:
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>

        <div className="modal-actions">
          <button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save"}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default StatusModal;
