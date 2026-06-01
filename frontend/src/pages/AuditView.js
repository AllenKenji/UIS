import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { collection, getCountFromServer } from "firebase/firestore";
import RegistryOverview from "../components/dashboard/RegistryOverview";
import RegistryAudit from "../components/dashboard/RegistryAudit";
import AuditTable from "../components/document/AuditTable";
import DashboardCard from "../components/dashboard/DashboardCard";
import AuditExportPanel from "../components/audit/AuditExportPanel";
import { db } from "../services/firebase";
import { AuditAPI } from "../services/api";
import "../styles/audit.css";

const AuditView = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [metrics, setMetrics] = useState({
    residents: "...",
    businesses: "...",
    documents: "...",
    logins: "...",
    auditLogs: "...",
  });

  const isAdminAudit = location.pathname.startsWith("/admin/audit");
  const basePath = isAdminAudit ? "/admin/audit" : "/audit";

  const pages = useMemo(
    () => [
      { key: "overview", label: "Overview", path: basePath },
      { key: "registry", label: "Registry Audit", path: `${basePath}/registry` },
      { key: "documents", label: "Document Audit", path: `${basePath}/documents` },
      { key: "exports", label: "Export Reports", path: `${basePath}/exports` },
    ],
    [basePath]
  );

  const activePage = useMemo(() => {
    if (location.pathname.endsWith("/registry")) return "registry";
    if (location.pathname.endsWith("/documents")) return "documents";
    if (location.pathname.endsWith("/exports")) return "exports";
    return "overview";
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    const loadMetrics = async () => {
      const readCount = async (key) => {
        try {
          const snap = await getCountFromServer(collection(db, key));
          return snap.data().count;
        } catch (error) {
          console.warn(`Failed to load ${key} count:`, error);
          return "N/A";
        }
      };

      const [residents, businesses, documents, logins, logs] = await Promise.all([
        readCount("residents"),
        readCount("businesses"),
        readCount("documents"),
        readCount("logins"),
        AuditAPI.list().catch(() => []),
      ]);

      if (!cancelled) {
        setMetrics({
          residents,
          businesses,
          documents,
          logins,
          auditLogs: Array.isArray(logs) ? logs.length : "N/A",
        });
      }
    };

    loadMetrics();
    return () => {
      cancelled = true;
    };
  }, []);

  const summaryCards = [
    { label: "Resident Records", value: metrics.residents, variant: "accent", icon: "👥" },
    { label: "Business Records", value: metrics.businesses, variant: "success", icon: "💼" },
    { label: "Document Requests", value: metrics.documents, variant: "dilg", icon: "📄" },
    { label: "Login Events", value: metrics.logins, variant: "info", icon: "🔐" },
    { label: "Audit Logs", value: metrics.auditLogs, variant: "warning", icon: "🧾" },
  ];

  return (
    <section className="dashboard audit-dashboard">
      <header className="audit-hero">
        <div>
          <p className="audit-kicker">{isAdminAudit ? "Administrative Oversight" : "DILG Oversight Dashboard"}</p>
          <h2>{isAdminAudit ? "📊 Audit Center" : "🕵️ DILG Audit Dashboard"}</h2>
          <p>
            Review live registry status, inspect document audit logs, and export compliance-ready summaries.
          </p>
        </div>
        <div className="audit-hero-actions">
          <button type="button" className="audit-secondary-btn" onClick={() => navigate(pages[0].path)}>
            Overview
          </button>
          <button type="button" className="audit-primary-btn" onClick={() => navigate(`${basePath}/exports`)}>
            Export Reports
          </button>
        </div>
      </header>

      <div className="audit-summary-grid">
        {summaryCards.map((card) => (
          <DashboardCard
            key={card.label}
            label={card.label}
            value={card.value}
            variant={card.variant}
            icon={card.icon}
          />
        ))}
      </div>

      <nav className="audit-page-nav" aria-label="Audit pages">
        {pages.map((page) => (
          <button
            key={page.key}
            type="button"
            className={`audit-page-link ${activePage === page.key ? "active" : ""}`}
            onClick={() => navigate(page.path)}
          >
            {page.label}
          </button>
        ))}
      </nav>

      <div className="audit-tools">
        {activePage === "overview" && (
          <>
            <section className="tool-section audit-span-2">
              <h3>📋 Registry Performance Overview</h3>
              <p className="audit-section-copy">
                Use this view to assess registry scale and period-based compliance trends before drilling into document actions.
              </p>
              <div className="audit-stacked-tools">
                <RegistryOverview />
                <RegistryAudit />
              </div>
            </section>

            <section className="tool-section audit-span-2">
              <h3>📑 Document Audit Activity</h3>
              <p className="audit-section-copy">
                Review recorded document actions and identify operational gaps that may require follow-up.
              </p>
              <AuditTable />
            </section>
          </>
        )}

        {activePage === "registry" && (
          <section className="tool-section audit-span-2">
            <h3>📋 Registry Audit</h3>
            <p className="audit-section-copy">
              Monitor resident, business, youth, login, and collection trends using the live registry audit module.
            </p>
            <div className="audit-stacked-tools">
              <RegistryOverview />
              <RegistryAudit />
            </div>
          </section>
        )}

        {activePage === "documents" && (
          <section className="tool-section audit-span-2">
            <h3>📑 Document Audit Logs</h3>
            <p className="audit-section-copy">
              Inspect document-level actions, approvals, and processing history for accountability reviews.
            </p>
            <AuditTable />
          </section>
        )}

        {activePage === "exports" && (
          <section className="tool-section audit-span-2">
            <h3>📤 Export and Reporting</h3>
            <p className="audit-section-copy">
              Download a current audit summary for submission, offline review, or external compliance documentation.
            </p>
            <AuditExportPanel />
          </section>
        )}
      </div>
    </section>
  );
};

export default AuditView;
