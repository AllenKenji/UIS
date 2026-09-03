import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { PublicServicesAPI, API_BASE_URL, BusinessesAPI, ComplaintsAPI, IncidentsAPI } from "../services/api";
import PublicBackBar from "../components/public/PublicBackBar";
import MyDocuments from "../components/resident/MyDocuments";
import ResidentBusinessDashboard from "../components/resident/ResidentBusinessDashboard";
import MyIncidents from "../components/resident/MyIncidents";
import ComplaintList from "../components/dashboard/ComplaintList";
import { formatAddress } from "../utils/addressFormat";
import { useMyDocuments } from "../hooks/useMyDocuments";
import { getLastSeen, markSeen } from "../utils/attentionTracking";
import "./public-services.css";

const SERVICE_ROUTES = {
  "document-request": { label: "Document Request", to: "documents/new" },
  "business-registration": { label: "Business Registration", to: "businesses/new" },
  "complaint-filing": { label: "File a Complaint", to: "complaints/new" },
  "incident-report": { label: "Report an Incident", to: "incidents/new" },
};

// Resident photo comes back as a backend-relative path (e.g. "/storage/...")
// rather than a full URL — resolve it against the API host, same as
// ResidentList.js's resolveFileUrl.
const resolveFileUrl = (url) => (url?.startsWith("/") ? `${API_BASE_URL}${url}` : url);

function ProfilePhoto({ profile }) {
  if (!profile.photoUrl) return null;
  return (
    <img
      src={resolveFileUrl(profile.photoUrl)}
      alt={profile.fullName}
      className="public-profile-photo"
    />
  );
}

function MyInformationPanel({ profile }) {
  const [open, setOpen] = useState(false);
  const address = formatAddress(profile.address, { includeProvince: true });

  return (
    <div className="public-my-info">
      <button type="button" onClick={() => setOpen((o) => !o)}>
        {open ? "Hide My Information" : "👁️ View My Information"}
      </button>
      {open && (
        <div className="public-profile-details">
          <p><strong>Full Name:</strong> {profile.fullName}</p>
          <p><strong>Birth Date:</strong> {profile.birthDate}</p>
          <p><strong>Gender:</strong> {profile.gender || "—"}</p>
          <p><strong>Civil Status:</strong> {profile.civilStatus || "—"}</p>
          <p><strong>Email:</strong> {profile.email || "—"}</p>
          <p><strong>Mobile Number:</strong> {profile.contactNumber || "—"}</p>
          <p><strong>Occupation:</strong> {profile.occupation || "—"}</p>
          <p><strong>Voter Status:</strong> {profile.voterStatus || "—"}</p>
          <p><strong>Head of Family:</strong> {profile.isHeadOfFamily ? "Yes" : "No"}</p>
          <p><strong>Address:</strong> {address || "—"}</p>
        </div>
      )}
    </div>
  );
}

function RequestUpdateForm({ profile, onSubmitted }) {
  const [open, setOpen] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [document, setDocument] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (remarks.trim().length < 5) {
      setError("Please describe what needs to be corrected or updated (at least 5 characters).");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await PublicServicesAPI.requestUpdate(profile.residentId, profile.barangayId, remarks.trim(), document);
      onSubmitted();
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Failed to submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="public-update-request">
      <button type="button" onClick={() => setOpen((o) => !o)}>
        {open ? "Cancel" : "✏️ Something needs to change? Request an update"}
      </button>
      {open && (
        <form onSubmit={handleSubmit} className="public-lookup">
          <p className="public-note">
            Tell barangay staff what needs to be corrected or updated (e.g. new address, corrected spelling). Your
            current information stays as-is, and services are on hold, until staff reviews this request.
          </p>
          {error && <p className="public-error">{error}</p>}
          <label>
            What needs to change?
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={3}
              required
            />
          </label>
          <label>
            Supporting document <span>(optional — e.g. proof of new address)</span>
            <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(event) => setDocument(event.target.files?.[0] || null)} />
          </label>
          <button type="submit" disabled={submitting}>{submitting ? "Submitting..." : "Submit Request"}</button>
        </form>
      )}
    </div>
  );
}

const STATUS_TABS = [
  { key: "documents", label: "📄 Documents" },
  { key: "businesses", label: "🏢 Businesses" },
  { key: "complaints", label: "📢 Complaints" },
  { key: "incidents", label: "🚨 Incidents" },
];

// Small tab badges for "My Requests" — flags a tab only when something
// there actually needs the resident to look/act, not for every record in a
// terminal state forever:
// - Documents: rejected-and-not-yet-resubmitted, or awaiting payment —
//   self-clears once the resident acts, so no "seen" tracking needed.
// - Businesses: expired, rejected, or approved but expiring within 30
//   days — same, self-clears on renewal/resubmission.
// - Complaints/Incidents: just informational status changes (no resident
//   action resolves them), so these use the "last seen" tracking in
//   attentionTracking.js instead — flagged only until the resident opens
//   that tab, then cleared until the next update.
function useAttentionCounts(residentId) {
  const { docs } = useMyDocuments(residentId);
  const [businesses, setBusinesses] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [incidents, setIncidents] = useState([]);

  useEffect(() => {
    if (!residentId) return;
    BusinessesAPI.listMine(residentId)
      .then((data) => setBusinesses(Array.isArray(data) ? data : []))
      .catch(() => setBusinesses([]));
    ComplaintsAPI.listMinePublic(residentId)
      .then((data) => setComplaints(Array.isArray(data) ? data : []))
      .catch(() => setComplaints([]));
    IncidentsAPI.listMinePublic(residentId)
      .then((data) => setIncidents(Array.isArray(data) ? data : []))
      .catch(() => setIncidents([]));
  }, [residentId]);

  const documentsCount = docs.filter(
    (d) => (d.status === "rejected" && !d.resubmitted) || d.status === "for_payment"
  ).length;

  const businessesCount = businesses.filter((b) => {
    const status = String(b.status || "").toLowerCase();
    if (status === "expired" || status === "rejected") return true;
    if (status === "approved" && b.validUntil) {
      const daysLeft = Math.ceil((new Date(b.validUntil) - new Date()) / (1000 * 60 * 60 * 24));
      return daysLeft <= 30;
    }
    return false;
  }).length;

  const toDate = (value) => {
    if (!value) return null;
    if (typeof value === "object" && typeof value.seconds === "number") return new Date(value.seconds * 1000);
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const complaintsLastSeen = getLastSeen(residentId, "complaints");
  const complaintsCount = complaints.filter((c) => {
    if (String(c.status || "").toLowerCase() !== "resolved") return false;
    const changedAt = toDate(c.resolved_at || c.updatedAt || c.timestamp);
    return changedAt && (!complaintsLastSeen || changedAt > complaintsLastSeen);
  }).length;

  const incidentsLastSeen = getLastSeen(residentId, "incidents");
  const incidentsCount = incidents.filter((i) => {
    const status = String(i.status || "").toLowerCase();
    if (!["resolved", "escalated"].includes(status)) return false;
    const changedAt = toDate(i.updatedAt);
    return changedAt && (!incidentsLastSeen || changedAt > incidentsLastSeen);
  }).length;

  return { documents: documentsCount, businesses: businessesCount, complaints: complaintsCount, incidents: incidentsCount };
}

export default function PublicServicesAccess() {
  const { barangayId } = useParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  // "Back to My Profile" (PublicBackBar) navigates here with the already
  // looked-up profile in state, so this page shouldn't ask for the
  // email/mobile + birth date again — only the very first visit should.
  const [profile, setProfile] = useState(state?.profile || null);
  const [identifier, setIdentifier] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [statusTab, setStatusTab] = useState("documents");
  const attentionCounts = useAttentionCounts(profile?.residentId);

  const lookup = async (event) => {
    event?.preventDefault();
    setError("");
    setLoading(true);
    try {
      setProfile(await PublicServicesAPI.resolve(identifier, birthDate, barangayId));
    } catch (requestError) {
      setProfile(null);
      setError(requestError.response?.data?.detail || "Profile lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  const renderProfile = () => {
    if (profile.verificationStatus === "pending") {
      return (
        <>
          <div className="public-profile-header">
            <ProfilePhoto profile={profile} />
            <h1>Welcome, {profile.fullName}</h1>
          </div>
          <p className="public-note">
            {profile.updateRequestRemarks
              ? "⏳ Your requested information update is pending review by barangay staff. Barangay services are on hold until it's reviewed."
              : "⏳ Your registration is still pending verification by barangay staff. Please visit or contact the barangay office (bring a valid ID) to complete verification — you'll be able to avail of services once verified."}
          </p>
          {profile.updateRequestRemarks && (
            <div className="public-profile-details">
              <p><strong>Requested change:</strong> {profile.updateRequestRemarks}</p>
            </div>
          )}
          <MyInformationPanel profile={profile} />
          <button type="button" onClick={() => setProfile(null)}>Use another identifier</button>
        </>
      );
    }
    if (profile.verificationStatus === "rejected") {
      return (
        <>
          <div className="public-profile-header">
            <ProfilePhoto profile={profile} />
            <h1>Welcome, {profile.fullName}</h1>
          </div>
          <p className="public-error">
            ❌ Your registration was not verified by barangay staff. Please contact or visit the barangay office for
            assistance.
          </p>
          {profile.verificationNotes && (
            <div className="public-profile-details">
              <p><strong>Reason:</strong> {profile.verificationNotes}</p>
            </div>
          )}
          <MyInformationPanel profile={profile} />
          <button type="button" onClick={() => setProfile(null)}>Use another identifier</button>
        </>
      );
    }
    return (
      <>
        <div className="public-profile-header">
          <ProfilePhoto profile={profile} />
          <div>
            <h1>Welcome, {profile.fullName}</h1>
            <p>Your saved profile is ready for Barangay services.</p>
          </div>
        </div>

        <h2>Available Services</h2>
        <ul className="public-service-list">
          {profile.services.map((service) => {
            const route = SERVICE_ROUTES[service];
            return (
              <li key={service}>
                <button
                  type="button"
                  className="public-service-link"
                  onClick={() => navigate(`/b/${barangayId}/public-services/${route?.to || ""}`, { state: { profile } })}
                >
                  {route?.label || service.replace(/-/g, " ")}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="public-note">Choose a service to use your saved information for form prefill.</p>

        {/* Status of anything already filed, incl. Pay Now once staff verifies attachments and moves a request to "for_payment" */}
        <section className="public-status-section">
          <h2>My Requests</h2>
          <div className="public-status-tabs" role="tablist">
            {STATUS_TABS.map((tab) => {
              const count = attentionCounts[tab.key] || 0;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={statusTab === tab.key}
                  className={statusTab === tab.key ? "active" : ""}
                  onClick={() => {
                    setStatusTab(tab.key);
                    // Complaints/incidents are informational-only (no
                    // resident action clears them), so opening the tab is
                    // what marks the update "seen" — see useAttentionCounts.
                    if (tab.key === "complaints" || tab.key === "incidents") {
                      markSeen(profile.residentId, tab.key);
                    }
                  }}
                >
                  {tab.label}
                  {count > 0 && <span className="tab-badge">{count}</span>}
                </button>
              );
            })}
          </div>
          <div className="public-status-panel">
            {statusTab === "documents" && (
              <MyDocuments residentId={profile.residentId} allowResubmit={false} publicPrintMode />
            )}
            {statusTab === "businesses" && (
              <ResidentBusinessDashboard residentId={profile.residentId} />
            )}
            {statusTab === "complaints" && (
              <ComplaintList residentId={profile.residentId} title="📢 My Complaints" />
            )}
            {statusTab === "incidents" && (
              <MyIncidents residentId={profile.residentId} />
            )}
          </div>
        </section>

        <h2>My Account</h2>
        <div className="public-account-actions">
          <MyInformationPanel profile={profile} />
          <RequestUpdateForm profile={profile} onSubmitted={lookup} />
        </div>

        <button type="button" onClick={() => setProfile(null)}>Use another identifier</button>
      </>
    );
  };

  return (
    <main className="public-services">
      <PublicBackBar barangayId={barangayId} />
      <section className={`public-card${profile ? " public-card--profile" : ""}`}>
        {!profile ? (
          <>
            <h1>Barangay Services</h1>
            <p>Enter your registered email address or Philippine mobile number, plus your birth date, to load your saved information.</p>
            {error && <p className="public-error">{error}</p>}
            <form className="public-lookup" onSubmit={lookup}>
              <label>Email or Mobile Number<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="name@example.com or 09171234567" required /></label>
              <label>Birth Date<input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} required /></label>
              <button type="submit" disabled={loading}>{loading ? "Loading..." : "Continue"}</button>
            </form>
          </>
        ) : renderProfile()}
      </section>
    </main>
  );
}
