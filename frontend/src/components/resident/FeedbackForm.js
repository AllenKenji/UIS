import React, { useState } from "react";
import "../../styles/admin.css";

const FeedbackForm = () => {
  const [message, setMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Feedback submitted:", message);
    // TODO: Send to Firestore
  };

  return (
    <div className="feedback-form">
      <h3>💬 Submit Feedback</h3>
      <form onSubmit={handleSubmit}>
        <textarea
          rows="4"
          placeholder="Your feedback..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default FeedbackForm;
