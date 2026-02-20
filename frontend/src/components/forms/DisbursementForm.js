import React, { useState } from "react";
import { db } from "../../services/firebase";
import { collection, addDoc } from "firebase/firestore";
import "../../styles/treasurer/disbursement-form.css";

function DisbursementForm({ onClose }) {
  const [form, setForm] = useState({
    category: "",
    amount: "",
    date: "",
    recipient: "",
    processedBy: "Treasurer",
    status: "pending",
  });

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    await addDoc(collection(db, "disbursements"), {
      ...form,
      amount: Number(form.amount),
      date: new Date(form.date),
      referenceNo: `DISB-${Date.now()}`,
    });
    onClose(); // close modal after saving
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
              <option value="Salaries">Salaries</option>
              <option value="Supplies">Supplies</option>
              <option value="Utilities">Utilities</option>
              <option value="Infrastructure">Infrastructure</option>
              <option value="Health Programs">Health Programs</option>
              <option value="Miscellaneous">Miscellaneous</option>
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
            <input type="text" name="recipient" value={form.recipient} onChange={handleChange} required />
          </label>
          <div className="modal-actions">
            <button type="submit">Save</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DisbursementForm;
