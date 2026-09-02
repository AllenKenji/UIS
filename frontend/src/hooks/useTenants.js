import { useCallback, useEffect, useState } from "react";
import { SuperAdminAPI } from "../services/api";

/**
 * Shared tenant/city loader for the Super Admin pages.
 * Every Super Admin sub-page needs the barangay + city lists for its
 * filters/dropdowns, so this keeps that fetch (and its error handling)
 * in one place instead of duplicating it per page.
 */
export function useTenants(cityFilter = "") {
  const [tenants, setTenants] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    Promise.all([
      SuperAdminAPI.listTenants(cityFilter ? { city: cityFilter } : {}),
      SuperAdminAPI.listCities(),
    ])
      .then(([t, c]) => {
        setTenants(t);
        setCities(c);
      })
      .catch((err) => setError(err.response?.data?.detail || "Failed to load barangays"))
      .finally(() => setLoading(false));
  }, [cityFilter]);

  useEffect(refresh, [refresh]);

  return { tenants, cities, loading, error, refresh };
}
