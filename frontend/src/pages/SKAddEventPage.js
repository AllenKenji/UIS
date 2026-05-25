import React from "react";
import { useNavigate } from "react-router-dom";
import EventCalendar from "../components/youth/EventCalendar";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection";
import "../styles/sk.css";

const SKAddEventPage = () => {
  const navigate = useNavigate();
  const events = useFirestoreCollection("sk_events");

  return (
    <section className="dashboard sk-dashboard sk-form-page">
      <header className="sk-header">
        <h2>➕ Add Event</h2>
        <p>Create a new SK event entry.</p>
        <div className="sk-header-actions">
          <button type="button" className="sk-secondary-btn" onClick={() => navigate("/youth/events")}>
            Back to Events
          </button>
        </div>
      </header>

      <section className="tool-section">
        <EventCalendar events={events} formOnly />
      </section>
    </section>
  );
};

export default SKAddEventPage;
