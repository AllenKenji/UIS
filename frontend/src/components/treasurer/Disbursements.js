import { useState, useEffect } from "react";
import { useDisbursements } from "../../hooks/useDisbursements";
import { AccountsAPI, DisbursementsAPI } from "../../services/api";
import DisbursementForm from "../forms/DisbursementForm";
import StatusModal from "./StatusModal";

function Disbursements() {
  const { disbursements = [], totals = {}, byCategory = {} } = useDisbursements();
  const [showForm, setShowForm] = useState(false);
  const [selectedDisbursement, setSelectedDisbursement] = useState(null);
  const [users, setUsers] = useState([]);

  useEffect(() => { 
    const fetchUsers = async () => { 
      try { 
        const accounts = await AccountsAPI.list({ limit: 50 }); 
        setUsers(accounts); 
      } catch (err) { 
        console.error("Failed to fetch accounts", err); 
      } 
    }; 
    fetchUsers(); 
  }, []);

  const getUserName = (uid) => { 
    const user = users.find(u => u.uid === uid); 
    return user ? (user.full_name || user.email) : uid; 
  };

  const handleDelete = async (id) => { 
    if (!window.confirm("Are you sure you want to delete this disbursement?")) return; 
    try { 
      await DisbursementsAPI.delete(id); 
    } catch (err) { 
      console.error("Failed to delete disbursement", err);
    } 
  };

  return (
    <div className="treasurer-main">
      <header className="header">
        <h1>Disbursements</h1>
        <button className="add-btn" onClick={() => setShowForm(true)}>
          + Add Disbursement
        </button>
      </header>

      {showForm && <DisbursementForm onClose={() => setShowForm(false)} />}
      {selectedDisbursement && (
        <StatusModal
          disbursement={selectedDisbursement}
          onClose={() => setSelectedDisbursement(null)}
        />
      )}

      {/* Summary Section */}
      <section className="summary">
        <h2>Summary</h2>
        <ul>
          <li><strong>Total Approved Disbursed:</strong> ₱{totals.spentApproved?.toLocaleString() || 0}</li>
          <li><strong>Total Pending Disbursement:</strong> ₱{totals.spentPending?.toLocaleString() || 0}</li>
          <li><strong>Approved Transactions:</strong> {totals.countApproved}</li>
          <li><strong>Pending Transactions:</strong> {totals.countPending}</li>
          <li><strong>All Transactions:</strong> {totals.totalCount}</li>
        </ul>
      </section>


      {/* Category Breakdown */}
      <section className="categories">
        <h2>By Category</h2>
        {Object.keys(byCategory).length === 0 ? (
          <p>No disbursements recorded yet.</p>
        ) : (
          <ul>
            {Object.entries(byCategory).map(([category, amount]) => (
              <li key={category}>{category}: ₱{amount.toLocaleString()}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Detailed Transactions */}
      <section className="transactions">
        <h2>Transaction Details</h2>
        {disbursements.length === 0 ? (
          <p>No transactions available.</p>
        ) : (
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Reference ID</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Recipient</th>
                <th>Processed By</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {disbursements.map(d => (
                <tr
                  key={d.id}
                  onClick={() => setSelectedDisbursement(d)}
                  style={{ cursor: "pointer" }}
                >
                  <td>{d.referenceNo || d.id}</td>
                  <td>{d.category || "Miscellaneous"}</td>
                  <td>₱{(d.amount || 0).toLocaleString()}</td>
                  <td>{d.date ? new Date(d.date).toLocaleDateString() : "—"}</td>
                  <td>
                    {d.category === "Salaries"
                      ? getUserName(d.recipientId || d.recipient) 
                      : d.recipient || "—"}
                  </td>
                  <td>{getUserName(d.processedByName)}</td>
                  <td>{d.status || "—"}</td>
                  <td>
                    <button 
                      className="delete-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(d.id)
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default Disbursements;
