import { Navigate, useLocation, useParams } from "react-router-dom";
import ResidentDocumentRequestForm from "../../components/resident/ResidentDocumentRequestForm";
import PublicBackBar from "../../components/public/PublicBackBar";
import "../public-services.css";

export default function PublicDocumentRequest() {
  const { barangayId } = useParams();
  const { state } = useLocation();
  const profile = state?.profile;

  if (!profile) return <Navigate to={`/b/${barangayId}/public-services`} replace />;

  return (
    <main className="public-services">
      <PublicBackBar barangayId={barangayId} profile={profile} />
      <section className="public-card">
        <ResidentDocumentRequestForm
          residentId={profile.residentId}
          residentName={profile.fullName}
          barangayId={barangayId}
          redirectTo={`/b/${barangayId}/public-services`}
          redirectState={{ profile }}
          showConfirmation
        />
      </section>
    </main>
  );
}
