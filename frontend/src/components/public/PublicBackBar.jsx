import { Link } from "react-router-dom";

/**
 * Small nav strip shown above the card on every public self-service page so
 * residents always have a way back to the barangay portal or to switch
 * barangay, instead of relying on the browser's back button.
 */
export default function PublicBackBar({ barangayId }) {
  return (
    <div className="public-back-bar">
      <Link to={`/b/${barangayId}`}>← Back to Barangay Portal</Link>
      <Link to="/">🏠 Change Barangay</Link>
    </div>
  );
}
