import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "react-toastify";
import { db } from "../../services/firebase";
import { useUser } from "../../context/UserContext";
import "../../styles/sk.css";

const formatDateTime = (value) => {
  if (!value) return "just now";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "just now";
  return date.toLocaleString();
};

const YouthFeedbackForm = ({ feedbackItems = [], readOnly = false }) => {
  const { userInfo, role } = useUser();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);

  const canModerate = !readOnly && (role === "admin" || role === "sk");

  const latestFeedback = [...feedbackItems]
    .sort((a, b) => {
      const aTime = typeof a.createdAt?.toDate === "function" ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
      const bTime = typeof b.createdAt?.toDate === "function" ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 5);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Feedback message is required.");
      return;
    }

    setSending(true);
    try {
      await addDoc(collection(db, "youth_feedback"), {
        message: message.trim(),
        authorName: userInfo?.fullName || userInfo?.name || userInfo?.email || "SK Member",
        authorUid: userInfo?.uid || null,
        status: "new",
        createdAt: serverTimestamp(),
      });
      toast.success("Feedback submitted.");
    } catch (error) {
      console.error("Failed to submit youth feedback", error);
      toast.error("Failed to submit feedback.");
    }

    setMessage("");
    setSending(false);
  };

  const handleStatusUpdate = async (id, status) => {
    setUpdatingId(id);
    try {
      await updateDoc(doc(db, "youth_feedback", id), {
        status,
        updatedAt: serverTimestamp(),
      });
      toast.success("Feedback status updated.");
    } catch (error) {
      console.error("Failed to update feedback status", error);
      toast.error("Failed to update feedback status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this feedback entry?")) return;

    setUpdatingId(id);
    try {
      await deleteDoc(doc(db, "youth_feedback", id));
      toast.success("Feedback deleted.");
    } catch (error) {
      console.error("Failed to delete feedback", error);
      toast.error("Failed to delete feedback.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="youth-feedback-form">
      {!readOnly ? (
        <form onSubmit={handleSubmit}>
          <textarea
            rows="4"
            placeholder="Share youth concerns, requests, or proposals..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button type="submit" disabled={sending}>{sending ? "Sending..." : "Send"}</button>
        </form>
      ) : null}

      {latestFeedback.length > 0 ? (
        <div className="sk-feed-list">
          {latestFeedback.map((item) => (
            <article key={item.id} className="sk-feed-item">
              <p>{item.message || "No message"}</p>
              <small>
                {item.authorName || "Anonymous"} • {formatDateTime(item.createdAt)}
              </small>
              <div className="sk-item-meta">
                <span>Status: {item.status || "new"}</span>
              </div>
              {canModerate ? (
                <div className="sk-item-actions">
                  <button
                    type="button"
                    className="sk-secondary-btn"
                    disabled={updatingId === item.id}
                    onClick={() => handleStatusUpdate(item.id, "in-review")}
                  >
                    In Review
                  </button>
                  <button
                    type="button"
                    className="sk-secondary-btn"
                    disabled={updatingId === item.id}
                    onClick={() => handleStatusUpdate(item.id, "resolved")}
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    className="sk-danger-btn"
                    disabled={updatingId === item.id}
                    onClick={() => handleDelete(item.id)}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="sk-empty-state">No feedback yet.</p>
      )}
    </div>
  );
};

export default YouthFeedbackForm;
