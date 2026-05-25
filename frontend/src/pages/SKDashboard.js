import React, { useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import YouthRegistry from "../components/youth/YouthRegistry";
import ProgramList from "../components/youth/ProgramList";
import EventCalendar from "../components/youth/EventCalendar";
import YouthFeedbackForm from "../components/youth/YouthFeedbackForm";
import { useResidents } from "../hooks/useResidents";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection";
import "../styles/sk.css";

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getResidentAge = (resident) => {
  if (typeof resident.age === "number") return resident.age;
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

const isYouthResident = (resident) => {
  const age = getResidentAge(resident);
  return typeof age === "number" && age >= 15 && age <= 30;
};

const SKDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { residents, loading: residentsLoading } = useResidents();
  const programs = useFirestoreCollection("sk_programs");
  const events = useFirestoreCollection("sk_events");
  const feedback = useFirestoreCollection("youth_feedback");

  const registryRef = useRef(null);
  const programsRef = useRef(null);
  const eventsRef = useRef(null);
  const feedbackRef = useRef(null);

  const youthResidents = useMemo(
    () => residents.filter((resident) => isYouthResident(resident)),
    [residents]
  );

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

  const quickNav = [
    { key: "registry", title: "Youth Registry", value: youthResidents.length, path: "/youth/registry", ref: registryRef },
    { key: "programs", title: "Programs", value: activePrograms.length, path: "/youth/programs", ref: programsRef },
    { key: "events", title: "Events", value: upcomingEvents.length, path: "/youth/events", ref: eventsRef },
    { key: "feedback", title: "Feedback", value: pendingFeedback.length, path: "/youth/feedback", ref: feedbackRef },
  ];

  const pathToSection = {
    "/youth/registry": "registry",
    "/youth/programs": "programs",
    "/youth/events": "events",
    "/youth/feedback": "feedback",
  };
  const activeSection = pathToSection[location.pathname] || "all";

  const handleScrollTo = (targetRef, path) => {
    if (location.pathname !== path) {
      navigate(path);
    }
    targetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const shouldShowSection = (section) => activeSection === "all" || activeSection === section;

  return (
    <section className="dashboard sk-dashboard">
      <header className="sk-header">
        <h2>🧒 SK Dashboard</h2>
        <p>Live youth operations view for registry, programs, events, and feedback.</p>
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
    </section>
  );
};

export default SKDashboard;
