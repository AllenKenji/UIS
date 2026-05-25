import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "react-toastify";
import { db } from "../../services/firebase";
import "../../styles/sk.css";

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleDateString() : "Date not set";
};

const toInputDate = (value) => {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
};

const EventCalendar = ({ events = [] }) => {
  const [form, setForm] = useState({ title: "", date: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const aTime = toDate(a.date || a.eventDate || a.createdAt)?.getTime() || 0;
      const bTime = toDate(b.date || b.eventDate || b.createdAt)?.getTime() || 0;
      return aTime - bTime;
    });
  }, [events]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const clearForm = () => {
    setForm({ title: "", date: "", location: "" });
    setEditingId(null);
  };

  const handleEdit = (eventItem) => {
    setEditingId(eventItem.id);
    setForm({
      title: eventItem.title || "",
      date: toInputDate(eventItem.date || eventItem.eventDate),
      location: eventItem.location || "",
    });
  };

  const handleDelete = async (eventId) => {
    if (!window.confirm("Delete this SK event?")) return;

    try {
      await deleteDoc(doc(db, "sk_events", eventId));
      toast.success("Event deleted.");
      if (editingId === eventId) {
        clearForm();
      }
    } catch (error) {
      console.error("Failed to delete SK event", error);
      toast.error("Failed to delete event.");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.date || !form.location.trim()) {
      toast.error("Event title, date, and location are required.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "sk_events", editingId), {
          title: form.title.trim(),
          date: form.date,
          location: form.location.trim(),
          updatedAt: serverTimestamp(),
        });
        toast.success("Event updated.");
      } else {
        await addDoc(collection(db, "sk_events"), {
          title: form.title.trim(),
          date: form.date,
          location: form.location.trim(),
          createdAt: serverTimestamp(),
        });
        toast.success("Event added.");
      }
      clearForm();
    } catch (error) {
      console.error("Failed to add SK event", error);
      toast.error("Failed to save event changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="event-calendar">
      <h4 className="sk-form-title">{editingId ? "Edit Event" : "Add Event"}</h4>
      <form id="add-event-form" className="sk-inline-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Event title"
          value={form.title}
          onChange={(e) => handleChange("title", e.target.value)}
        />
        <input
          type="date"
          value={form.date}
          onChange={(e) => handleChange("date", e.target.value)}
        />
        <input
          type="text"
          placeholder="Location"
          value={form.location}
          onChange={(e) => handleChange("location", e.target.value)}
        />
        <button type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Update Event" : "Add Event"}</button>
        {editingId ? (
          <button type="button" className="sk-secondary-btn" onClick={clearForm}>
            Cancel Edit
          </button>
        ) : null}
      </form>

      {sortedEvents.length === 0 ? (
        <p className="sk-empty-state">No events yet. Add an SK event to start the calendar.</p>
      ) : (
        <ul>
          {sortedEvents.map((item) => (
            <li key={item.id}>
              <strong>{item.title || "Untitled Event"}</strong>
              <div className="sk-item-meta">
                <span>{formatDate(item.date || item.eventDate)}</span>
                <span>{item.location || "Location not set"}</span>
              </div>
              <div className="sk-item-actions">
                <button type="button" className="sk-secondary-btn" onClick={() => handleEdit(item)}>
                  Edit
                </button>
                <button type="button" className="sk-danger-btn" onClick={() => handleDelete(item.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EventCalendar;
