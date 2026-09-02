import { useState } from "react";
import documentConfig from "../../config/documentConfig";
import { API_BASE_URL } from "../../services/api";

// Document attachments are saved as backend-relative paths (e.g. "/storage/documents/...")
// rather than full URLs — resolve them against the API host, same as resident
// photo/ID/signature uploads (see ResidentList.js's resolveFileUrl).
const resolveFileUrl = (url) => (url?.startsWith("/") ? `${API_BASE_URL}${url}` : url);

const getAttachmentMeta = (file) => {
  if (!file) return { url: null, filename: null };

  if (typeof file === "string") {
    const raw = String(file || "").trim();
    if (!raw) return { url: null, filename: null };
    const nameFromUrl = raw.split("?")[0].split("#")[0].split("/").pop() || null;
    return { url: resolveFileUrl(raw), filename: nameFromUrl };
  }

  const rawUrl = file.url || file.path || null;
  const explicitName = file.filename || file.fileName || file.name || null;
  const nameFromUrl = rawUrl
    ? (String(rawUrl).split("?")[0].split("#")[0].split("/").pop() || null)
    : null;

  return {
    url: resolveFileUrl(rawUrl),
    filename: explicitName || nameFromUrl,
  };
};

const RequestModal = ({ doc, onClose, onUpdateStatus }) => {
  const [rejectionReason, setRejectionReason] = useState("");

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      alert("Rejection reason is required.");
      return;
    }
    onUpdateStatus(doc.id, "rejected", rejectionReason.trim());
  };

  // 🔹 Get config for this document type
  const config = documentConfig[doc.document_type] || {};

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <header>
          <h4>{doc.resident_name || doc.resident_id}</h4>
          <p className="doc-type">{doc.document_type}</p>
          <p className="doc-id">Document ID: {doc.document_id}</p>
        </header>

        {/* 🔹 Details Section */}
        {config.fields && (
          <section className="doc-details">
            <h5>Details</h5>
            <ul>
                {config.fields.map((field) => {
                    if (field.type === "group" && field.fields) {
                    return (
                        <li key={field.label}>
                        <strong>{field.label}:</strong>
                        <ul>
                            {field.fields.map((subField) => {
                            let value;
                            if (typeof subField.name === "string" && subField.name.includes(".")) {
                                value = subField.name.split(".").reduce(
                                (acc, key) => acc?.[key],
                                { ...doc, ...doc.extraFields }
                                );
                            } else {
                                value = doc[subField.name] ?? doc.extraFields?.[subField.name];
                            }
                            return value ? (
                                <li key={subField.name}>
                                <strong>{subField.label}:</strong> {value}
                                </li>
                            ) : null;
                            })}
                        </ul>
                        </li>
                    );
                    }

                    // normal field
                    if (!field?.name) return null;
                    let value;
                    if (typeof field.name === "string" && field.name.includes(".")) {
                    value = field.name.split(".").reduce(
                        (acc, key) => acc?.[key],
                        { ...doc, ...doc.extraFields }
                    );
                    } else {
                    value = doc[field.name] ?? doc.extraFields?.[field.name];
                    }

                    return value ? (
                    <li key={field.name}>
                        <strong>{field.label}:</strong> {value}
                    </li>
                    ) : null;
                })}
            </ul>
          </section>
        )}

        {/* 🔹 Attachments Section */}
        {config.attachments && doc.attachments && (
        <section className="attachments">
            <h5>Attachments</h5>
            <ul>
            {config.attachments.map((att) => {
            const file = doc.attachments[att.name];
            const { url, filename } = getAttachmentMeta(file);
            if (!url) return null;

                return (
                <li key={att.name}>
                    <strong>{att.label}:</strong>{" "}
              {url.match(/\.(jpg|jpeg|png|gif)$/i) ? (
                    <div>
                        <img
                src={url}
                        alt={att.label}
                        style={{ maxWidth: "200px", display: "block", marginTop: "5px" }}
                        />
                <a href={url} target="_blank" rel="noopener noreferrer">
                View File
                </a>
                {filename && <small> ({filename})</small>}
                    </div>
                    ) : (
                    <div>
                <a href={url} target="_blank" rel="noopener noreferrer">
                        View File
                        </a>
                {filename && <small> ({filename})</small>}
                    </div>
                    )}
                </li>
                );
            })}
            </ul>
        </section>
        )}

        {/* 🔹 Actions Section */}
        <section className="doc-actions">
          <button
            className="btn-awaiting"
            onClick={() => onUpdateStatus(doc.id, "for_payment")}
          >
            💳 For Payment
          </button>

          <div className="reject-section">
            <textarea
              className="reject-textarea"
              placeholder="Enter rejection reason..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
            <button className="btn-reject" onClick={handleReject}>
              ❌ Reject
            </button>
          </div>

          <button className="btn-close" onClick={onClose}>
            ⬅️ Close
          </button>
        </section>
      </div>
    </div>
  );
};

export default RequestModal;
