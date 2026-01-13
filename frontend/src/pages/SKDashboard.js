import React from "react";
import YouthRegistry from "../components/youth/YouthRegistry";
import ProgramList from "../components/youth/ProgramList";
import EventCalendar from "../components/youth/EventCalendar";
import YouthFeedbackForm from "../components/youth/YouthFeedbackForm";
import "../styles/admin.css";

const SKDashboard = () => {
  return (
    <section className="dashboard sk-dashboard">
      <header>
        <h2>🧒 SK Dashboard</h2>
        <p>Manage youth registry, programs, events, and feedback.</p>
      </header>

      <div className="sk-tools">
        <section className="tool-section">
          <h3>📋 Youth Registry</h3>
          <YouthRegistry />
        </section>

        <section className="tool-section">
          <h3>🎯 Program List</h3>
          <ProgramList />
        </section>

        <section className="tool-section">
          <h3>📅 Event Calendar</h3>
          <EventCalendar />
        </section>

        <section className="tool-section">
          <h3>💬 Youth Feedback</h3>
          <YouthFeedbackForm />
        </section>
      </div>
    </section>
  );
};

export default SKDashboard;
