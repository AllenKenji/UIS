import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { PublicServicesAPI, API_BASE_URL } from "../../services/api";
import defaultLogo from "../../assets/barangay_logo.png";
import "../public-services.css";

const navLinks = [
  { label: "Home", href: "#top" },
  { label: "Services", href: "#services" },
  { label: "Programs & Events", href: "#announcements" },
  { label: "Contact", href: "#contact" },
];

const formatDate = (value) => {
  if (!value) return "Date not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
};

const resolveImageUrl = (url) => (url?.startsWith("/") ? `${API_BASE_URL}${url}` : url);

const AnnouncementCard = ({ item, metaLine }) => (
  <li className="public-announcement-card">
    {item.imageUrl && <img src={resolveImageUrl(item.imageUrl)} alt={item.title || "Announcement"} />}
    <div className="public-announcement-body">
      <strong>{item.title || "Untitled"}</strong>
      <div className="public-announcement-meta">{metaLine}</div>
      {item.description && <p>{item.description}</p>}
    </div>
  </li>
);

export default function BarangayPortal() {
  const { barangayId } = useParams();
  const [tenant, setTenant] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [announcements, setAnnouncements] = useState({ programs: [], events: [] });

  useEffect(() => {
    PublicServicesAPI.getTenant(barangayId)
      .then(setTenant)
      .catch(() => setNotFound(true));
    PublicServicesAPI.announcements(barangayId)
      .then(setAnnouncements)
      .catch(() => setAnnouncements({ programs: [], events: [] }));
  }, [barangayId]);

  if (notFound) return <Navigate to="/" replace />;

  const services = [
    { icon: "📝", title: "Resident Registration", description: "Create a resident profile for future Barangay transactions.", action: "Register", to: `/b/${barangayId}/register` },
    { icon: "📄", title: "Document Requests", description: "Request certificates, clearances, and other Barangay documents.", action: "Access services", to: `/b/${barangayId}/public-services` },
    { icon: "🏢", title: "Business Services", description: "Register, renew, or follow up on local business applications.", action: "Access services", to: `/b/${barangayId}/public-services` },
    { icon: "📣", title: "Complaints", description: "Submit a community concern for Barangay review.", action: "Access services", to: `/b/${barangayId}/public-services` },
    { icon: "🚨", title: "Incident Reports", description: "Report an incident and provide supporting details.", action: "Access services", to: `/b/${barangayId}/public-services` },
  ];

  const locationLabel = tenant ? `${tenant.barangay}, ${tenant.city}` : "";
  const logoSrc = tenant?.logoUrl ? resolveImageUrl(tenant.logoUrl) : defaultLogo;

  return (
    <div id="top" className="public-site">
      <div className="public-topbar">
        <span>Republic of the Philippines{locationLabel ? ` · ${locationLabel}` : ""}</span>
        <div style={{ display: "flex", gap: "16px" }}>
          <Link to="/">Change barangay</Link>
          <Link to="/login">Staff sign in</Link>
        </div>
      </div>

      <header className="public-site-header">
        <div className="public-brand">
          <img src={logoSrc} alt="Barangay seal" className="public-brand-seal" />
          <div>
            <p className="public-eyebrow">Barangay Information System</p>
            <h1>{tenant ? `Barangay ${tenant.barangay}` : "Barangay Services Portal"}</h1>
          </div>
        </div>
        <nav className="public-nav" aria-label="Section navigation">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
        </nav>
      </header>

      <section className="public-hero">
        <div className="public-hero-copy">
          <h2>Barangay services, made simple.</h2>
          <p>Register once, then use your email address or mobile number anytime to request documents, register a business, file a complaint, or report an incident — no account needed.</p>
          <div className="public-hero-actions">
            <Link className="public-cta public-cta-primary" to={`/b/${barangayId}/register`}>Register as a Resident</Link>
            <Link className="public-cta public-cta-secondary" to={`/b/${barangayId}/public-services`}>Find My Profile</Link>
          </div>
        </div>
      </section>

      <main className="public-portal">
        <section id="services" className="public-service-tabs" aria-label="Barangay services">
          {services.map((service) => (
            <article className="public-service-tab" key={service.title}>
              <span className="public-service-icon" aria-hidden="true">{service.icon}</span>
              <h2>{service.title}</h2>
              <p>{service.description}</p>
              <Link to={service.to}>{service.action} →</Link>
            </article>
          ))}
        </section>

        <section id="announcements" className="public-announcements" aria-label="Barangay programs and events">
          <h2>Barangay Programs &amp; Events</h2>
          <div className="public-announcement-columns">
            <div>
              <h3>Programs</h3>
              {announcements.programs.length === 0 ? (
                <p className="public-note">No programs announced yet.</p>
              ) : (
                <ul>
                  {announcements.programs.map((program) => (
                    <AnnouncementCard
                      key={program.id}
                      item={program}
                      metaLine={[formatDate(program.date), program.category].filter(Boolean).join(" · ")}
                    />
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3>Events</h3>
              {announcements.events.length === 0 ? (
                <p className="public-note">No events announced yet.</p>
              ) : (
                <ul>
                  {announcements.events.map((event) => (
                    <AnnouncementCard
                      key={event.id}
                      item={event}
                      metaLine={[formatDate(event.date), event.location, event.category].filter(Boolean).join(" · ")}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <section className="public-help">
          <h2>Already registered?</h2>
          <p>Enter your registered email address or Philippine mobile number to load your profile before choosing a service.</p>
          <Link to={`/b/${barangayId}/public-services`}>Find my profile</Link>
        </section>
      </main>

      <footer id="contact" className="public-site-footer">
        <div className="public-footer-grid">
          <div>
            <img src={logoSrc} alt="Barangay seal" className="public-footer-seal" />
            <p>Barangay Information System — a digital front door for barangay transactions and community updates.</p>
          </div>
          <div>
            <h3>Barangay Hall</h3>
            <p>{locationLabel || "—"}</p>
            <p>{tenant?.officeHours || "Office hours not yet posted."}</p>
          </div>
          <div>
            <h3>Contact</h3>
            <p>Phone: {tenant?.contactNumber || "—"}</p>
            <p>Email: {tenant?.email || "—"}</p>
            <p>Emergency Hotline: {tenant?.emergencyHotline || "—"}</p>
          </div>
          <div>
            <h3>Quick Links</h3>
            {navLinks.map((link) => (
              <a key={link.href} href={link.href}>{link.label}</a>
            ))}
          </div>
        </div>
        <p className="public-footer-copyright">© {new Date().getFullYear()} Barangay Information System. All rights reserved.</p>
      </footer>
    </div>
  );
}
