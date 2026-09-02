import React, { useMemo, useRef, useState } from "react";
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

  const registryRef = useRef(null);
  const programsRef = useRef(null);
  const eventsRef = useRef(null);
  const feedbackRef = useRef(null);
  const [adminOversightSection, setAdminOversightSection] = useState("registry");

  const youthResidents = useMemo(() => {
    return residents
      .map((resident) => {
        const age = getResidentAge(resident);
        return { ...resident, _computedAge: age };
      })
      .filter((resident) => {
        return (
          typeof resident._computedAge === "number" &&
          resident._computedAge >= YOUTH_MIN_AGE &&
          resident._computedAge <= YOUTH_MAX_AGE
        );
      });
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

  const isAdminOversight = role === "admin" || location.pathname.startsWith("/admin/youth");

  const quickNav = [
    { key: "registry", title: "Youth Registry", value: youthResidents.length, path: "/youth/registry", ref: registryRef },
    { key: "programs", title: "Programs", value: activePrograms.length, path: "/youth/programs", ref: programsRef },
    { key: "events", title: "Events", value: upcomingEvents.length, path: "/youth/events", ref: eventsRef },
    { key: "feedback", title: "Feedback", value: pendingFeedback.length, path: "/youth/feedback", ref: feedbackRef },
  ];

  const activeSection = useMemo(() => {
    if (location.pathname.startsWith("/youth/registry")) return "registry";
    if (location.pathname.startsWith("/youth/programs")) return "programs";
    if (location.pathname.startsWith("/youth/events")) return "events";
    if (location.pathname.startsWith("/youth/feedback")) return "feedback";
    return "all";
  }, [location.pathname]);

  const isProgramAddRoute = location.pathname.startsWith("/youth/programs/add");
  const isEventAddRoute = location.pathname.startsWith("/youth/events/add");

  const handleScrollTo = (targetRef, path) => {
    if (location.pathname !== path) {
      navigate(path);
    }
    targetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const shouldShowSection = (section) => {
    if (isAdminOversight) return adminOversightSection === section;
    return activeSection === "all" || activeSection === section;
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

      <div className="sk-summary-grid">
        <article className="sk-summary-card">
          <h3>Youth Residents</h3>
          <p>{residentsLoading ? "..." : youthResidents.length}</p>
        </article>
        <article className="sk-summary-card">
          <h3>Active Programs</h3>
          <p>{activePrograms.length}</p>
        </article>
        <article className="sk-summary-card">
          <h3>Upcoming Events</h3>
          <p>{upcomingEvents.length}</p>
        </article>
        <article className="sk-summary-card">
          <h3>Open Feedback</h3>
          <p>{pendingFeedback.length}</p>
        </article>
      </div>

      {isAdminOversight ? (
        <>
          <div className="sk-nav-grid">
            {quickNav.map((item) => (
              <button
                key={item.title}
                type="button"
                className={`sk-nav-card ${adminOversightSection === item.key ? "active" : ""}`}
                onClick={() => setAdminOversightSection(item.key)}
              >
                <span>{item.title}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>

          <div className="sk-tools sk-tools-oversight">
            {shouldShowSection("registry") ? (
              <section className="tool-section" ref={registryRef}>
                <h3>📋 Youth Registry</h3>
                <YouthRegistry residents={youthResidents} loading={residentsLoading} />
              </section>
            ) : null}

            {shouldShowSection("programs") ? (
              <section className="tool-section" ref={programsRef}>
                <h3>🎯 Program List</h3>
                <ProgramList programs={programs} />
              </section>
            ) : null}

            {shouldShowSection("events") ? (
              <section className="tool-section" ref={eventsRef}>
                <h3>📅 Event Calendar</h3>
                <EventCalendar events={events} />
              </section>
            ) : null}

            {shouldShowSection("feedback") ? (
              <section className="tool-section" ref={feedbackRef}>
                <h3>💬 Youth Feedback</h3>
                <YouthFeedbackForm feedbackItems={feedback} />
              </section>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="sk-nav-grid">
            {quickNav.map((item) => (
              <button
                key={item.title}
                type="button"
                className={`sk-nav-card ${activeSection === item.key ? "active" : ""}`}
                onClick={() => handleScrollTo(item.ref, item.path)}
              >
                <span>{item.title}</span>
                <strong>{item.value}</strong>
              </button>
            ))}
          </div>

          <div className="sk-tools">
            {shouldShowSection("registry") ? (
            <section className="tool-section" ref={registryRef}>
              <h3>📋 Youth Registry</h3>
              <YouthRegistry residents={youthResidents} loading={residentsLoading} />
            </section>
            ) : null}

            {shouldShowSection("programs") ? (
            <section className="tool-section" ref={programsRef}>
              <h3>{isProgramAddRoute ? "➕ Add Program" : "🎯 Program List"}</h3>
              <ProgramList programs={programs} formOnly={isProgramAddRoute} />
            </section>
            ) : null}

            {shouldShowSection("events") ? (
            <section className="tool-section" ref={eventsRef}>
              <h3>{isEventAddRoute ? "➕ Add Event" : "📅 Event Calendar"}</h3>
              <EventCalendar events={events} formOnly={isEventAddRoute} />
            </section>
            ) : null}

            {shouldShowSection("feedback") ? (
            <section className="tool-section" ref={feedbackRef}>
              <h3>💬 Youth Feedback</h3>
              <YouthFeedbackForm feedbackItems={feedback} />
            </section>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
};

export default SKDashboard;
