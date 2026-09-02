import { useState } from "react";
import { useEnrichedRequests } from "../../hooks/useEnrichedRequests";
import { API_BASE_URL } from "../../services/api";
import "../../styles/secretary/issued-documents.css";

// Issued document files come back as backend-relative paths (e.g. "/storage/...")
// rather than full URLs — resolve them against the API host, same as resident
// photo/ID/signature uploads (see ResidentList.js's resolveFileUrl).
const resolveFileUrl = (url) => (url?.startsWith("/") ? `${API_BASE_URL}${url}` : url);

const IssuedDocuments = () => {
  const { approved, loading } = useEnrichedRequests(); 
  const [selectedDoc, setSelectedDoc] = useState(null);

  const renderDocumentCard = (doc) => (
    <li key={doc.id} className="request-card">
      <div className="request-info">
        <strong>{doc.residentName || doc.residentId}</strong>
        <span>{doc.documentType}</span>
        <small className="doc-id">({doc.documentId})</small>
      </div>
      <button className="btn-view" onClick={() => setSelectedDoc(doc)}>👁️ View</button>
    </li>
  );

  return (
    <div className="issued-documents">
      <h3>📜 Issued Documents</h3>
      {loading && <p className="status-message">Loading…</p>}

      {approved.length === 0 ? (
        <p className="status-message">No issued documents yet.</p>
      ) : (
        <ul className="request-list">{approved.map(renderDocumentCard)}</ul>
      )}

      {selectedDoc && (
        <div className="modal-overlay" onClick={() => setSelectedDoc(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header>
              <h4>{selectedDoc.residentName || selectedDoc.residentId}</h4>
              <p className="doc-type">{selectedDoc.documentType}</p>
              <p className="doc-id">Document ID: {selectedDoc.documentId}</p>
            </header>

            <section className="doc-meta">
              <p><strong>Purpose:</strong> {selectedDoc.purpose || "—"}</p>
              <p><strong>Issued By:</strong> {selectedDoc.issuedBy || "—"}</p>
              <p><strong>Issued At:</strong> {selectedDoc.issuedAt || "—"}</p>
              <p><strong>Status:</strong> {selectedDoc.status}</p>
            </section>

            <section className="doc-file">
              <h5>Issued File</h5>
              {selectedDoc.fileUrl ? (
                <a
                  href={resolveFileUrl(selectedDoc.fileUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-download"
                >
                  📄 Download Document
                </a>
              ) : (
                <p>No file uploaded yet.</p>
              )}
            </section>

            <button className="btn-close" onClick={() => setSelectedDoc(null)}>⬅️ Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default IssuedDocuments;
