import React, { useState } from "react";
import { useMyDocuments } from "../../hooks/useMyDocuments";
import "../../styles/resident/my-documents.css";

const MyDocuments = ({ residentId }) => {
  const [tab, setTab] = useState("active");
  const { docs, loading } = useMyDocuments(residentId);
  const [payingMap, setPayingMap] = useState({});

  // -----------------------------
  // Helpers
  // -----------------------------
  const renderStatusBadge = (status) => (
    <span className={`status-badge status-${status}`}>{status}</span>
  );

  const handleResubmit = (docId) => {
    window.location.href = `/resubmit/${docId}`;
  };

  const createDocumentPaymentLink = async (doc) => {
    const res = await fetch(`/api/paymongo/create-document-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId: doc.document_id,
        documentType: doc.document_type,
        remarks: doc.remarks || "",
      }),
    });
    if (!res.ok) throw new Error(`Payment API error: ${await res.text()}`);
    return res.json();
  };

  const attachPaymentMethod = async (paymentIntentId, paymongoClientKey, method, doc) => {
    const res = await fetch(`/api/paymongo/attach-payment-method`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "payment_method",
        paymentIntentId,
        paymongoClientKey,
        method,
        billing: {
          name: doc.resident_name || "Resident",
          email: doc.resident_email || "resident@example.com",
        },
        return_url: "http://localhost:3000/payment-success?type=document",
      }),
    });
    if (!res.ok) throw new Error(`Attach method error: ${await res.text()}`);
    const data = await res.json();
    return data?.redirectUrl;
  };

  // -----------------------------
  // Payment Flow
  // -----------------------------
  const handlePaymentIntent = async (doc, method = "gcash") => {
    const docId = doc.document_id;
    if (!docId) {
      alert("Invalid document ID.");
      return;
    }
    setPayingMap((prev) => ({ ...prev, [docId]: true }));

    try {
      const data = await createDocumentPaymentLink(doc);
      const { paymentIntentId, checkoutUrl, paymongoClientKey } = data;

      if (checkoutUrl) {
        window.open(checkoutUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (!paymentIntentId) {
        alert("No payment intent ID returned.");
        return;
      }

      const redirectUrl = await attachPaymentMethod(paymentIntentId, paymongoClientKey, method, doc);
      if (redirectUrl) {
        window.open(redirectUrl, "_blank", "noopener,noreferrer");
      } else {
        alert("Payment method attached but no redirect URL returned.");
      }
    } catch (err) {
      console.error("❌ Payment flow error:", err);
      alert("Failed to initiate payment. Please try again.");
    } finally {
      setPayingMap((prev) => ({ ...prev, [docId]: false }));
    }
  };

  // -----------------------------
  // Rendering
  // -----------------------------
  const renderPaymentButtons = (doc, isPaying) => (
    <div className="payment-options">
      {["gcash", "grab_pay"].map((method) => (
        <button
          key={method}
          className="btn-pay"
          disabled={isPaying}
          onClick={() => handlePaymentIntent(doc, method)}
        >
          💳 Pay with {method === "gcash" ? "GCash" : "GrabPay"}
        </button>
      ))}
    </div>
  );

  const renderDocumentCard = (doc) => {
    const docId = doc.document_id;
    const isPaying = payingMap[docId] || false;

    return (
      <li key={docId} className="doc-card">
        <div className="doc-info">
          <strong>{doc.document_type || "Untitled Document"}</strong>
          <span>Status: {renderStatusBadge(doc.status)}</span>
          {doc.issuedAt && (
            <span>
              Issued At: {new Date(doc.issuedAt).toLocaleString()}
            </span>
          )}
          {doc.transactionId && (
            <span>
              Transaction ID: {doc.transactionId}
            </span>
          )}
        </div>

        {doc.remarks && <p className="doc-remarks">Remarks: {doc.remarks}</p>}

        {doc.status === "rejected" && tab === "needsAttention" && (
          <button className="btn-resubmit" onClick={() => handleResubmit(docId)}>
            🔄 Resubmit
          </button>
        )}

        {doc.status === "for_payment" && tab === "active" && renderPaymentButtons(doc, isPaying)}

        {/* ✅ Show download link if document is approved and fileUrl exists */}
        {doc.status === "approved" && doc.fileUrl && (
          <div className="download-section">
            <a
              href={doc.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-download"
            >
              📄 Download Issued Document
            </a>
          </div>
        )}
      </li>
    );
  };


  const filterDocs = (docs) => {
    switch (tab) {
      case "active":
        return docs.filter((doc) => ["pending", "for_payment", "awaiting_payment", "paid"].includes(doc.status));
      case "needsAttention":
        return docs.filter((doc) => doc.status === "rejected" && !doc.resubmitted);
      case "history":
        return docs.filter(
          (doc) =>
            ["approved", "paid"].includes(doc.status) ||
            (doc.status === "rejected" && doc.resubmitted)
        );
      default:
        return [];
    }
  };

  const renderContent = () => {
    const filteredDocs = filterDocs(docs);
    if (loading) return <p>Loading…</p>;
    if (filteredDocs.length === 0) return <p>No documents found.</p>;
    return <ul className="doc-list">{filteredDocs.map(renderDocumentCard)}</ul>;
  };

  const renderTabs = () => (
    <div className="tabs">
      {["active", "needsAttention", "history"].map((key) => (
        <button key={key} onClick={() => setTab(key)} className={tab === key ? "active" : ""}>
          {key === "active" && "Active Requests"}
          {key === "needsAttention" && "Needs Attention"}
          {key === "history" && "History and Issued Documents"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="my-documents">
      <h3>📄 My Documents</h3>
      {renderTabs()}
      {renderContent()}
    </div>
  );
};

export default MyDocuments;
