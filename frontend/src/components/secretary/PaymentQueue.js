import React, { useEffect, useState } from "react";
import { api } from "../../services/api";

const PaymentQueue = () => {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const { data } = await api.get("/api/documents", { params: { status: "awaiting_payment" } });
        setQueue(data);
      } catch (err) {
        console.error("❌ Error fetching payment queue:", err.message);
      }
    };
    fetchQueue();
  }, []);

  return (
    <div className="sidebar-section">
      <h3>💳 Payment Queue</h3>
      {queue.length === 0 ? (
        <p>No payments awaiting confirmation.</p>
      ) : (
        <ul>
          {queue.map(doc => (
            <li key={doc.id}>
              {doc.resident_name || doc.resident_id} — {doc.document_type}
              <button onClick={() => console.log("Confirm Payment", doc.id)}>✅ Confirm</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default PaymentQueue;
