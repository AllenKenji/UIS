import { useState } from "react";
import { useMyDocuments } from "../../hooks/useMyDocuments";
import { api, API_BASE_URL } from "../../services/api";
import "../../styles/resident/my-documents.css";

// Issued document files come back as backend-relative paths (e.g. "/storage/...")
// rather than full URLs — resolve them against the API host, same as resident
// photo/ID/signature uploads (see ResidentList.js's resolveFileUrl).
const resolveFileUrl = (url) => (url?.startsWith("/") ? `${API_BASE_URL}${url}` : url);

const MyDocuments = ({ residentId, allowResubmit = true, publicPrintMode = false }) => {
  const [tab, setTab] = useState("active");
  const { docs, loading, refresh } = useMyDocuments(residentId);
  const [payingMap, setPayingMap] = useState({});
  const [printingMap, setPrintingMap] = useState({});

  // -----------------------------
  // Helpers
  // -----------------------------
  const renderStatusBadge = (status) => (
    <span className={`status-badge status-${status}`}>{status}</span>
  );

  const handleResubmit = (docId) => {
    window.location.href = `/resubmit/${docId}`;
  };

  // Public self-service gets one print, not a standing download link — no
  // account means no way to know who might still have the link later.
  //
  // We print from an off-screen, toolbar-less iframe instead of opening the
  // PDF in a new tab: a new tab hands the resident the browser's full PDF
  // viewer chrome, complete with its own visible Download button — printing
  // in place removes that obvious save path. This is best-effort, not a
  // guarantee: the print dialog's own "Save as PDF" virtual printer is an
  // OS/browser feature no web page can remove, and nothing stops a
  // screenshot. It just stops the one-click download button.
  const handlePublicPrint = async (doc) => {
    // `document_id` is the human-readable label (e.g. "Barangay_Clearance-0001")
    // used for display — the API needs the actual record id.
    const recordId = doc.id;
    const mapKey = doc.document_id;
    if (!recordId) {
      alert("Unable to print: missing document reference.");
      return;
    }
    setPrintingMap((prev) => ({ ...prev, [mapKey]: true }));
    try {
      // The PDF is served from the API's own origin (a different port in dev),
      // so an iframe pointed straight at it is cross-origin — the browser
      // blocks contentWindow.print() from the parent page entirely in that
      // case. Fetching it as a blob and framing the blob: URL instead makes
      // it same-origin from the page's perspective, which print() allows.
      const pdfResponse = await fetch(resolveFileUrl(doc.fileUrl));
      if (!pdfResponse.ok) throw new Error(`Failed to fetch document (${pdfResponse.status})`);
      const blobUrl = URL.createObjectURL(await pdfResponse.blob());

      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.src = `${blobUrl}#toolbar=0&navpanes=0&scrollbar=0`;

      const cleanup = () => {
        iframe.parentNode?.removeChild(iframe);
        URL.revokeObjectURL(blobUrl);
      };
      iframe.addEventListener("load", () => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (printErr) {
          console.error("❌ In-place print failed:", printErr);
        }
        // The print dialog is modal in most browsers, so `afterprint` fires
        // once it's dismissed either way (printed or cancelled).
        iframe.contentWindow.addEventListener("afterprint", cleanup, { once: true });
        setTimeout(cleanup, 60000); // safety net if afterprint never fires
      });
      document.body.appendChild(iframe);

      await api.patch(`/api/documents/${recordId}/public-print`);
      refresh();
    } catch (err) {
      console.error("❌ Failed to record one-time print:", err);
      alert("Failed to open the print dialog. Please try again.");
    } finally {
      setPrintingMap((prev) => ({ ...prev, [mapKey]: false }));
    }
  };

  const createDocumentPaymentLink = async (doc) => {
    const res = await fetch(`${API_BASE_URL}/api/paymongo/create-document-link`, {
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
    const res = await fetch(`${API_BASE_URL}/api/paymongo/attach-payment-method`, {
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
        return_url: `${window.location.origin}/payment-success?type=document&documentId=${encodeURIComponent(doc.document_id)}`,
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

        {doc.status === "approved" && doc.remarks ? (
          <p className="doc-remarks">Issuance Remarks: {doc.remarks}</p>
        ) : (
          doc.remarks && <p className="doc-remarks">Remarks: {doc.remarks}</p>
        )}

        {doc.status === "rejected" && tab === "needsAttention" && (
          allowResubmit ? (
            <button className="btn-resubmit" onClick={() => handleResubmit(docId)}>
              🔄 Resubmit
            </button>
          ) : (
            <p className="doc-remarks">Please visit or contact the barangay office to resubmit this request.</p>
          )
        )}

        {doc.status === "for_payment" && tab === "active" && renderPaymentButtons(doc, isPaying)}

        {/* Public self-service: one-time print instead of a standing download link */}
        {publicPrintMode && doc.status === "approved" && doc.fileUrl && (
          <div className="download-section">
            {doc.publicPrinted ? (
              <p className="doc-remarks">
                🖨️ Already printed. Please visit or contact the barangay office for another copy.
              </p>
            ) : (
              <button
                type="button"
                className="btn-download"
                disabled={printingMap[docId]}
                onClick={() => handlePublicPrint(doc)}
              >
                🖨️ Print Document (one-time)
              </button>
            )}
          </div>
        )}

        {/* ✅ Authenticated resident dashboard: standing download link */}
        {!publicPrintMode && doc.status === "approved" && doc.fileUrl && (
          <div className="download-section">
            <a
              href={resolveFileUrl(doc.fileUrl)}
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
