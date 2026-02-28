import { useState, useCallback, useEffect } from "react";
import { ResidentsAPI } from "../services/api";
import { toast } from "react-toastify";

export const useResidents = () => {
  const [residents, setResidents] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchResidents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ResidentsAPI.list();
      const items = Array.isArray(data) ? data : data?.items ?? [];
      setResidents(items);
    } catch (err) {
      console.error("❌ Failed to fetch residents:", err.message || err);
      toast.error("❌ Failed to fetch residents");
      setResidents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResidents();
  }, [fetchResidents]);

  const addResident = async (payload) => {
    try {
      await ResidentsAPI.create(payload);
      toast.success("✅ Resident added");
      fetchResidents();
    } catch (err) {
      console.error("❌ Failed to add resident:", err.message || err);
      toast.error("❌ Failed to add resident");
    }
  };

  const updateResident = async (id, updatedData) => {
    try {
      await ResidentsAPI.update(id, updatedData);
      toast.success("✅ Resident updated");
      fetchResidents();
    } catch (err) {
      console.error("❌ Failed to update resident:", err.message || err);
      toast.error("❌ Failed to update resident");
    }
  };

  const deleteResident = async (id) => {
    if (!window.confirm("Are you sure you want to delete this resident?")) return;

    setResidents((prev) => prev.filter((r) => r.id !== id));

    try {
      await ResidentsAPI.delete(id);
      toast.success("🗑️ Resident deleted");
      fetchResidents();
    } catch (err) {
      console.error("❌ Failed to delete resident:", err.message || err);
      toast.error("❌ Failed to delete resident");
      fetchResidents(); 
    }
  };

  return { residents, loading, fetchResidents, addResident, updateResident, deleteResident };
};
