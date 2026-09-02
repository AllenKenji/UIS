import { useEffect, useState } from "react";
import { api, endpoints } from "../services/api";
import { useUser } from "../context/UserContext";

export const useAllDocuments = () => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { userInfo, role, isAuthenticated } = useUser();

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        if (!isAuthenticated || !userInfo?.uid) throw new Error("No logged-in user");

        let url = endpoints.documents;
        let params = {};

        if (role === "resident") {
          url = `${endpoints.documents}/my`;
          params = { resident_id: userInfo.uid };
        }

        const res = await api.get(url, { params });
        setDocs(res.data);
      } catch (err) {
        console.error("❌ Error fetching documents:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 1000); 

    return () => clearTimeout(timer); 
  }, [userInfo, role, isAuthenticated]);

  return { docs, loading, error };
};
