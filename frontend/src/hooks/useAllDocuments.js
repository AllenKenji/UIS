import { useEffect, useState } from "react";
import { api, endpoints } from "../services/api";
import { getAuth } from "firebase/auth";

export const useAllDocuments = () => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) throw new Error("No logged-in user");

        // 🔑 get custom claims or role from your backend
        const token = await user.getIdTokenResult();
        const role = token.claims.role;

        let url = endpoints.documents;
        let params = {};

        if (role === "resident") {
          url = `${endpoints.documents}/my`;
          params = { resident_id: user.uid };
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
  }, []);

  return { docs, loading, error };
};
