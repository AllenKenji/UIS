import { Link } from "react-router-dom";

/**
 * Small nav strip shown above the card on every public self-service page so
 * residents always have a way back, instead of relying on the browser's
 * back button.
 *
 * Service sub-pages (document/business/complaint/incident forms) are
 * reached from the profile view and should pass their `profile` prop
 * through here — "back" then returns to the profile (preserved, so there's
 * no need to look it up again) instead of the barangay portal landing page.
 * The profile page itself (and pages with no profile, e.g. registration)
 * omit `profile` and get the portal link instead.
 */
export default function PublicBackBar({ barangayId, profile = null }) {
  return (
    <div className="public-back-bar">
      {profile ? (
        <Link to={`/b/${barangayId}/public-services`} state={{ profile }}>← Back to My Profile</Link>
      ) : (
        <Link to={`/b/${barangayId}`}>← Back to Barangay Portal</Link>
      )}
      <Link to="/">🏠 Change Barangay</Link>
    </div>
  );
}
