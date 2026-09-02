import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import ComplaintForm from "../../components/forms/ComplaintForm";
import PublicBackBar from "../../components/public/PublicBackBar";
import "../public-services.css";

export default function PublicComplaintForm() {
  const { barangayId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const profile = state?.profile;

  if (!profile) return <Navigate to={`/b/${barangayId}/public-services`} replace />;

  return (
    <main className="public-services">
      <PublicBackBar barangayId={barangayId} />
      <section className="public-card">
        <ComplaintForm residentProfile={profile} onSubmitSuccess={() => navigate(`/b/${barangayId}/public-services`)} />
      </section>
    </main>
  );
}
