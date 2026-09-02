import { useUser } from "../../context/UserContext";
import ResidentDashboard from "../../pages/ResidentDashboard";

const ResidentDashboardWrapper = () => {
  const { userInfo } = useUser();
  return <ResidentDashboard residentId={userInfo?.uid} />;
};

export default ResidentDashboardWrapper;