import { useState, useEffect } from "react";
import { AccountsAPI, DisbursementsAPI } from "../../services/api"; 
import { useUser } from "../../context/UserContext";
import "../../styles/treasurer/disbursement-form.css";

function DisbursementForm({ onClose }) {
  const { userInfo: currentUser } = useUser();

  const initialFormState = {
    category: "",
    amount: "",
    date: "",
    recipient: "",
    processedBy: "",
    status: "pending",
  };

  const [form, setForm] = useState(initialFormState);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  // 🔄 Load accounts for "Salaries" category
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const accounts = await AccountsAPI.list({ limit: 50 });
        setUsers(accounts);

        if (currentUser) { 
          const me = accounts.find(acc => acc.uid === currentUser.uid);
          if (me) { 
            setForm(prev => ({ ...prev, processedBy: me.full_name })); 
          } else { 
            setForm(prev => ({ ...prev, processedBy: currentUser.email }));
          } 
        }
      } catch (err) {
        console.error("Failed to fetch accounts", err);
      }
    };
    fetchUsers();
  }, [currentUser]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      ...form,
      amount: Number(form.amount),
      date: new Date(form.date),
      referenceNo: `DISB-${Date.now()}`,
      recipientId: form.category === "Salaries" ? form.recipient : null,
      recipientName: form.category === "Salaries"
        ? users.find(u => u.uid === form.recipient)?.full_name
        : form.recipient,
      processedById: currentUser?.uid,
      processedByName: users.find(u => u.uid === currentUser?.uid)?.full_name || currentUser?.email,
    };


    try {
      await DisbursementsAPI.create(payload); // ✅ persist to backend
      setForm({ 
        category: "", 
        amount: "", 
        date: "", 
        recipient: "", 
        processedBy: form.processedBy, 
        status: "pending", 
      });
      onClose();
    } catch (err) {
      console.error("Failed to save disbursement", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>New Disbursement</h2>
        <form onSubmit={handleSubmit}>
          <label>
            Category:
            <select name="category" value={form.category} onChange={handleChange} required>
              <option value="">Select Category</option>
              {["Salaries","Supplies","Utilities","Infrastructure","Health Programs","Miscellaneous"]
                .map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </label>

          <label>
            Amount:
            <input type="number" name="amount" value={form.amount} onChange={handleChange} required />
          </label>

          <label>
            Date:
            <input type="date" name="date" value={form.date} onChange={handleChange} required />
          </label>

          <label>
            Recipient:
            {form.category === "Salaries" ? (
              <select name="recipient" value={form.recipient} onChange={handleChange} required>
                <option value="">Select User</option>
                {users.map(user => (
                  <option key={user.uid} value={user.uid}>
                    {user.full_name || user.email}
                  </option>
                ))}
              </select>
            ) : (
              <input type="text" name="recipient" value={form.recipient} onChange={handleChange} required />
            )}
          </label>

          <div className="modal-actions">
            <button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DisbursementForm;
