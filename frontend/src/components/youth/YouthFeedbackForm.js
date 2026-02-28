import { useState } from "react";
import "../../styles/admin.css";

const YouthFeedbackForm = () => {
  const [message, setMessage] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Youth feedback submitted:", message);
    // TODO: Send to Firestore
    setMessage("");
  };

  return (
    <div className="youth-feedback-form">
      <h3>💬 Youth Feedback</h3>
      <form onSubmit={handleSubmit}>
        <textarea
          rows="4"
          placeholder="Share your thoughts or suggestions..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
};

export default YouthFeedbackForm;
