import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase";
import { ResidentsAPI } from "../../services/api";
import ComplaintList from "./ComplaintList";
import IncidentQueue from "./IncidentQueue";

const normalizeStatus = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const isToday = (value) => {
  const date = toDate(value);
  if (!date) return false;
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date >= today && date < tomorrow;
};

const DashboardFocusPanel = ({ view }) => {
  const [residents, setResidents] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const residentRows = useMemo(
    () => residents.filter((resident) => isToday(resident.createdAt || resident.timestamp || resident.created_at)),
    [residents]
  );

  const businessRows = useMemo(
    () => businesses.filter((business) => normalizeStatus(business.status) !== "approved"),
    [businesses]
  );

  useEffect(() => {
    let cancelled = false;

    const fetchRows = async () => {
      setError(null);
      setLoading(true);

      try {
        if (view === "residents") {
          const data = await ResidentsAPI.list();
          const items = Array.isArray(data) ? data : data?.items ?? [];
          if (!cancelled) setResidents(items);
          return;
        }

        if (view === "businesses") {
          const snapshot = await getDocs(collection(db, "businesses"));
          const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          if (!cancelled) setBusinesses(rows);
          return;
        }
      } catch (err) {
        if (!cancelled) {
          console.error("❌ Failed to load dashboard panel records:", err);
          setError("Failed to load dashboard records.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (["residents", "businesses"].includes(view)) {
      fetchRows();
    } else {
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [view]);

  if (!view || view === "overview") {
    return <p>Select a summary card above to view the matching dashboard list.</p>;
  }

  if (view === "complaints") {
    return <ComplaintList excludeStatus="resolved" title="📢 Complaints Pending Review" />;
  }

  if (view === "incidents") {
    return <IncidentQueue statusFilter="pending" title="🚨 Incidents Pending" />;
  }

  if (view === "residents") {
    if (loading) return <p>Loading residents added today...</p>;
    if (error) return <p className="error">{error}</p>;

    return residentRows.length === 0 ? (
      <p>No residents were added today.</p>
    ) : (
      <table className="queue-table" aria-label="Residents Added Today">
        <thead>
          <tr>
            <th>Resident</th>
            <th>Barangay</th>
            <th>Added</th>
          </tr>
        </thead>
        <tbody>
          {residentRows.map((resident) => (
            <tr key={resident.id || resident.uid || resident.fullName}>
              <td>{resident.fullName || resident.name || "—"}</td>
              <td>{resident.address?.barangay || resident.barangay || "—"}</td>
              <td>{toDate(resident.createdAt || resident.timestamp || resident.created_at)?.toLocaleString() || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (view === "businesses") {
    if (loading) return <p>Loading businesses pending evaluation...</p>;
    if (error) return <p className="error">{error}</p>;

    return businessRows.length === 0 ? (
      <p>No pending evaluation.</p>
    ) : (
      <table className="queue-table" aria-label="Businesses Pending Evaluation">
        <thead>
          <tr>
            <th>Owner</th>
            <th>Business</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {businessRows.map((business) => (
            <tr key={business.id}>
              <td>{business.ownerName || business.owner || "—"}</td>
              <td>{business.businessName || business.name || "—"}</td>
              <td>{business.status || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return <p>Unsupported dashboard view.</p>;
};

export default DashboardFocusPanel;
