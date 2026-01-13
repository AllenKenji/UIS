import React from "react";
import { Link } from "react-router-dom";
// import "./unauthorized.css"; // Optional: for scoped styles

const Unauthorized = () => (
  <section className="unauthorized-page" aria-labelledby="unauthorized-title">
    <div className="unauthorized-content">
      <h2 id="unauthorized-title" className="unauthorized-heading">🚫 Access Denied</h2>
      <p className="unauthorized-message">You don’t have permission to view this page.</p>
      <Link to="/" className="unauthorized-link">← Back to Dashboard</Link>
    </div>
  </section>
);

export default Unauthorized;
