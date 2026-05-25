import React from "react";
import { useNavigate } from "react-router-dom";
import ProgramList from "../components/youth/ProgramList";
import { useFirestoreCollection } from "../hooks/useFirestoreCollection";
import "../styles/sk.css";

const SKAddProgramPage = () => {
  const navigate = useNavigate();
  const programs = useFirestoreCollection("sk_programs");

  return (
    <section className="dashboard sk-dashboard sk-form-page">
      <header className="sk-header">
        <h2>➕ Add Program</h2>
        <p>Create a new SK program entry.</p>
        <div className="sk-header-actions">
          <button type="button" className="sk-secondary-btn" onClick={() => navigate("/youth/programs")}>
            Back to Programs
          </button>
        </div>
      </header>

      <section className="tool-section">
        <ProgramList programs={programs} formOnly />
      </section>
    </section>
  );
};

export default SKAddProgramPage;
