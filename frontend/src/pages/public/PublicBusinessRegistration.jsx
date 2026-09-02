import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import BusinessForm from "../../components/forms/BusinessForm";
import PublicBackBar from "../../components/public/PublicBackBar";
import "../public-services.css";

export default function PublicBusinessRegistration() {
  const { barangayId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const profile = state?.profile;

  if (!profile) return <Navigate to={`/b/${barangayId}/public-services`} replace />;

  const backToServices = () => navigate(`/b/${barangayId}/public-services`);

  return (
    <main className="public-services">
      <PublicBackBar barangayId={barangayId} />
      <section className="public-card">
        <BusinessForm residentProfile={profile} onCancel={backToServices} onBusinessAdded={backToServices} />
      </section>
    </main>
  );
}
