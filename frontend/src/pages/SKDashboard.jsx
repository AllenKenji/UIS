import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import YouthRegistry from "../components/youth/YouthRegistry";
import ProgramList from "../components/youth/ProgramList";
import EventCalendar from "../components/youth/EventCalendar";
import YouthFeedbackForm from "../components/youth/YouthFeedbackForm";
import { useResidents } from "../hooks/useResidents";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection";
import { useUser } from "../context/UserContext";
import "../styles/sk.css";

const YOUTH_MIN_AGE = 15;
const YOUTH_MAX_AGE = 24;

const SECTION_ICONS = { registry: "📋", programs: "🎯", events: "📅", feedback: "💬" };

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getResidentAge = (resident) => {
  if (typeof resident.age === "number") return resident.age;
  if (typeof resident.age === "string") {
    const parsed = Number.parseInt(resident.age, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  const birthDateValue = resident.birthDate || resident.dateOfBirth || resident.dob;
  const birthDate = toDate(birthDateValue);
  if (!birthDate) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const SKDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useUser();
  const { residents, loading: residentsLoading } = useResidents();
  const programs = useFirestoreCollection("sk_programs");
  const events = useFirestoreCollection("sk_events");
  const feedback = useFirestoreCollection("youth_feedback");

  const isAdminOversight = role === "admin" || location.pathname.startsWith("/admin/youth");

  // Which section the current URL points at, if any (e.g. a direct link to
  // /youth/feedback, or the browser back/forward button) — null means the
  // bare "/youth" landing route, which just defaults to the first tab.
  const pathSection = useMemo(() => {
    if (location.pathname.startsWith("/youth/registry")) return "registry";
    if (location.pathname.startsWith("/youth/programs")) return "programs";
    if (location.pathname.startsWith("/youth/events")) return "events";
    if (location.pathname.startsWith("/youth/feedback")) return "feedback";
    return null;
  }, [location.pathname]);

  const [adminOversightSection, setAdminOversightSection] = useState("registry");
  const [normalSection, setNormalSection] = useState(pathSection || "registry");

  useEffect(() => {
    if (pathSection) setNormalSection(pathSection);
  }, [pathSection]);

  const activeSection = isAdminOversight ? adminOversightSection : normalSection;

  const isProgramAddRoute = !isAdminOversight && location.pathname.startsWith("/youth/programs/add");
  const isEventAddRoute = !isAdminOversight && location.pathname.startsWith("/youth/events/add");

  const youthResidents = useMemo(() => {
    return residents
      .map((resident) => ({ ...resident, _computedAge: getResidentAge(resident) }))
      .filter(
        (resident) =>
          typeof resident._computedAge === "number" &&
          resident._computedAge >= YOUTH_MIN_AGE &&
          resident._computedAge <= YOUTH_MAX_AGE
      );
  }, [residents]);

  const activePrograms = useMemo(
    () => programs.filter((program) => String(program.status || "").toLowerCase() !== "completed"),
    [programs]
  );

  const upcomingEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return events.filter((event) => {
      const eventDate = toDate(event.date || event.eventDate || event.scheduledAt);
      return eventDate ? eventDate >= today : false;
    });
  }, [events]);

  const pendingFeedback = useMemo(
    () => feedback.filter((item) => String(item.status || "new").toLowerCase() !== "resolved"),
    [feedback]
  );

  const tabs = [
    { key: "registry", title: "Youth Registry", value: youthResidents.length, path: "/youth/registry" },
    { key: "programs", title: "Programs", value: activePrograms.length, path: "/youth/programs" },
    { key: "events", title: "Events", value: upcomingEvents.length, path: "/youth/events" },
    { key: "feedback", title: "Feedback", value: pendingFeedback.length, path: "/youth/feedback" },
  ];

  const handleTabClick = (tab) => {
    if (isAdminOversight) {
      setAdminOversightSection(tab.key);
      return;
    }
    setNormalSection(tab.key);
    if (location.pathname !== tab.path) navigate(tab.path);
  };

  return (
    <section className="dashboard sk-dashboard">
      <header className="sk-header">
        <h2>{isAdminOversight ? "🧒 Youth System Oversight" : "🧒 SK Dashboard"}</h2>
        <p>
          {isAdminOversight
            ? `Administrative oversight view for youth operations (ages ${YOUTH_MIN_AGE}-${YOUTH_MAX_AGE}) across registry, programs, events, and feedback.`
            : `Live youth operations view (ages ${YOUTH_MIN_AGE}-${YOUTH_MAX_AGE}) for registry, programs, events, and feedback.`}
        </p>
        {!isAdminOversight ? (
          <div className="sk-header-actions">
            <button type="button" className="sk-secondary-btn" onClick={() => navigate("/youth/programs/add")}>
              Add Program
            </button>
            <button type="button" className="sk-secondary-btn" onClick={() => navigate("/youth/events/add")}>
              Add Event
            </button>
          </div>
        ) : null}
      </header>

      <nav className="sk-tab-grid" aria-label="Youth sections" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeSection === tab.key}
            className={`sk-tab-card ${activeSection === tab.key ? "active" : ""}`}
            onClick={() => handleTabClick(tab)}
          >
            <span className="sk-tab-icon" aria-hidden="true">{SECTION_ICONS[tab.key]}</span>
            <span className="sk-tab-body">
              <span className="sk-tab-title">{tab.title}</span>
              <strong className="sk-tab-value">{residentsLoading && tab.key === "registry" ? "…" : tab.value}</strong>
            </span>
          </button>
        ))}
      </nav>

      <div className="sk-active-panel">
        {activeSection === "registry" && (
          <section className="tool-section">
            <h3>📋 Youth Registry</h3>
            <YouthRegistry residents={youthResidents} loading={residentsLoading} />
          </section>
        )}

        {activeSection === "programs" && (
          <section className="tool-section">
            <h3>{isProgramAddRoute ? "➕ Add Program" : "🎯 Program List"}</h3>
            <ProgramList programs={programs} formOnly={isProgramAddRoute} />
          </section>
        )}

        {activeSection === "events" && (
          <section className="tool-section">
            <h3>{isEventAddRoute ? "➕ Add Event" : "📅 Event Calendar"}</h3>
            <EventCalendar events={events} formOnly={isEventAddRoute} />
          </section>
        )}

        {activeSection === "feedback" && (
          <section className="tool-section">
            <h3>💬 Youth Feedback</h3>
            <YouthFeedbackForm feedbackItems={feedback} />
          </section>
        )}
      </div>
    </section>
  );
};

export default SKDashboard;
