import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../services/firebase";
import { ResidentsAPI } from "../../services/api";
import ComplaintList from "./ComplaintList";
import IncidentQueue from "./IncidentQueue";
import DocumentQueue from "./DocumentQueue";

const YOUTH_MIN_AGE = 15;
const YOUTH_MAX_AGE = 24;

const normalizeStatus = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "_");

const parseAmount = (value) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getResidentAge = (resident) => {
  if (typeof resident.age === "number") return resident.age;
  if (typeof resident.age === "string") {
    const parsed = Number.parseInt(resident.age, 10);
    if (Number.isFinite(parsed)) return parsed;
  }

  const birthDate = toDate(resident.birthDate || resident.dateOfBirth || resident.dob);
  if (!birthDate) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

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
  const [collections, setCollections] = useState([]);
  const [logins, setLogins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const residentRows = useMemo(
    () => residents.filter((resident) => isToday(resident.createdAt || resident.timestamp || resident.created_at)),
    [residents]
  );

  const totalResidents = residents.length;

  const youthRows = useMemo(
    () =>
      residents.filter((resident) => {
        const age = getResidentAge(resident);
        return (
          typeof age === "number" &&
          age >= YOUTH_MIN_AGE &&
          age <= YOUTH_MAX_AGE &&
          isToday(resident.createdAt || resident.timestamp || resident.created_at)
        );
      }),
    [residents]
  );

  const businessRows = useMemo(
    () => businesses.filter((business) => normalizeStatus(business.status) !== "approved"),
    [businesses]
  );

  const collectionRows = useMemo(
    () =>
      collections
        .map((payment) => {
          const status = normalizeStatus(payment.status || payment.paymentStatus);
          const paidDate = toDate(payment.datePaid || payment.paymentDate || payment.timestamp || payment.createdAt);
          const isCollectedToday = status === "paid" && isToday(paidDate);
          return {
            ...payment,
            paidDate,
            amount: parseAmount(payment.amount),
            isCollectedToday,
          };
        })
        .filter((payment) => payment.isCollectedToday)
        .sort((a, b) => (b.paidDate?.getTime?.() || 0) - (a.paidDate?.getTime?.() || 0)),
    [collections]
  );

  const loginRows = useMemo(() => {
    const uniqueLogins = new Map();

    logins.forEach((entry) => {
      const timestamp = toDate(entry.timestamp || entry.createdAt);
      const eventType = String(entry.type || "login").trim().toLowerCase();
      if (!timestamp || !isToday(timestamp) || eventType !== "login") {
        return;
      }

      const key = String(entry.user_id || "").trim() || String(entry.user || "").trim().toLowerCase();
      if (!key) {
        return;
      }

      const existing = uniqueLogins.get(key);
      if (!existing || timestamp > existing.timestamp) {
        uniqueLogins.set(key, {
          key,
          name: entry.user || entry.name || entry.email || entry.user_id || "—",
          role: entry.role || "—",
          timestamp,
        });
      }
    });

    return Array.from(uniqueLogins.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [logins]);

  useEffect(() => {
    let cancelled = false;

    const fetchRows = async () => {
      setError(null);
      setLoading(true);

      try {
        if (view === "residents" || view === "youth") {
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

        if (view === "collections") {
          const snapshot = await getDocs(collection(db, "payments"));
          const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          if (!cancelled) setCollections(rows);
          return;
        }

        if (view === "logins") {
          const snapshot = await getDocs(collection(db, "logins"));
          const rows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          if (!cancelled) setLogins(rows);
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

    if (["residents", "youth", "businesses", "collections", "logins"].includes(view)) {
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

  if (view === "documents") {
    return <DocumentQueue statusFilter="pending_transactions" title="📄 Pending Document Transactions" />;
  }

  if (view === "collections") {
    if (loading) return <p>Loading today&apos;s collected transactions...</p>;
    if (error) return <p className="error">{error}</p>;

    return collectionRows.length === 0 ? (
      <p>No collections recorded today.</p>
    ) : (
      <div className="queue-table-wrap">
        <table className="queue-table" aria-label="Collections Today">
          <thead>
            <tr>
              <th>Payer</th>
              <th>Reference</th>
              <th>Amount</th>
              <th>Collected At</th>
            </tr>
          </thead>
          <tbody>
            {collectionRows.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.payerName || payment.ownerName || payment.residentName || payment.fullName || "—"}</td>
                <td>{payment.referenceNumber || payment.transactionId || payment.id || "—"}</td>
                <td>
                  {new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(payment.amount || 0)}
                </td>
                <td>{payment.paidDate?.toLocaleString() || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view === "logins") {
    if (loading) return <p>Loading persons logged in today...</p>;
    if (error) return <p className="error">{error}</p>;

    return loginRows.length === 0 ? (
      <p>No persons logged in today.</p>
    ) : (
      <div className="queue-table-wrap">
        <table className="queue-table" aria-label="Persons Logged In Today">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Latest Login</th>
            </tr>
          </thead>
          <tbody>
            {loginRows.map((login) => (
              <tr key={login.key}>
                <td>{login.name}</td>
                <td>{String(login.role || "—").replace(/_/g, " ")}</td>
                <td>{login.timestamp?.toLocaleString() || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view === "youth") {
    if (loading) return <p>Loading youth registered today...</p>;
    if (error) return <p className="error">{error}</p>;

    return youthRows.length === 0 ? (
      <p>No youth registrations recorded today.</p>
    ) : (
      <div className="queue-table-wrap">
        <table className="queue-table" aria-label="Youth Registered Today">
          <thead>
            <tr>
              <th>Resident</th>
              <th>Age</th>
              <th>Barangay</th>
              <th>Registered</th>
            </tr>
          </thead>
          <tbody>
            {youthRows.map((resident) => (
              <tr key={resident.id || resident.uid || resident.fullName}>
                <td>{resident.fullName || resident.name || "—"}</td>
                <td>{getResidentAge(resident) ?? "—"}</td>
                <td>{resident.address?.barangay || resident.barangay || "—"}</td>
                <td>{toDate(resident.createdAt || resident.timestamp || resident.created_at)?.toLocaleString() || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (view === "residents") {
    if (loading) return <p>Loading residents added today...</p>;
    if (error) return <p className="error">{error}</p>;

    return (
      <>
        <p><strong>Total Residents:</strong> {totalResidents}</p>
        {residentRows.length === 0 ? (
          <p>No residents were added today.</p>
        ) : (
          <div className="queue-table-wrap">
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
          </div>
        )}
      </>
    );
  }

  if (view === "businesses") {
    if (loading) return <p>Loading businesses pending evaluation...</p>;
    if (error) return <p className="error">{error}</p>;

    return businessRows.length === 0 ? (
      <p>No pending evaluation.</p>
    ) : (
      <div className="queue-table-wrap">
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
      </div>
    );
  }

  return <p>Unsupported dashboard view.</p>;
};

export default DashboardFocusPanel;
