import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { toast } from "react-toastify";
import { db } from "../../services/firebase";
import { useUser } from "../../context/UserContext";
import { DisbursementsAPI } from "../../services/api";
import "../../styles/sk.css";

const DISBURSEMENT_CATEGORIES = [
  "Salaries",
  "Supplies",
  "Utilities",
  "Infrastructure",
  "Health Programs",
  "Miscellaneous",
];

const EventCalendar = ({ events = [], formOnly = false, readOnly = false }) => {
  const { role, userInfo } = useUser();
  const [form, setForm] = useState({ title: "", date: "", location: "", category: "Miscellaneous", budget: "" });
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
    setForm({ title: "", date: "", location: "", category: "Miscellaneous", budget: "" });
    setEditingId(null);
  };

  const handleEdit = (eventItem) => {
    setEditingId(eventItem.id);
    setForm({
      title: eventItem.title || "",
      date: toInputDate(eventItem.date || eventItem.eventDate),
      location: eventItem.location || "",
      category: eventItem.category || "Miscellaneous",
      budget: eventItem.budget != null ? String(eventItem.budget) : "",
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
    const budget = Number(form.budget);
    if (!form.title.trim() || !form.date || !form.location.trim() || !form.category.trim() || !Number.isFinite(budget) || budget <= 0) {
      toast.error("Event title, date, location, category, and budget are required.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "sk_events", editingId), {
          title: form.title.trim(),
          date: form.date,
          location: form.location.trim(),
          category: form.category.trim(),
          budget,
          updatedAt: serverTimestamp(),
        });
        toast.success("Event updated.");
      } else {
        const createdEvent = await addDoc(collection(db, "sk_events"), {
          title: form.title.trim(),
          date: form.date,
          location: form.location.trim(),
          category: form.category.trim(),
          budget,
          createdAt: serverTimestamp(),
        });

        if (String(role || "").trim().toLowerCase() === "sk") {
          try {
            await DisbursementsAPI.create({
              category: form.category,
              amount: budget,
              date: new Date(form.date),
              recipient: form.title.trim(),
              recipientName: form.title.trim(),
              processedById: userInfo?.uid || null,
              processedByName:
                userInfo?.fullName ||
                userInfo?.full_name ||
                userInfo?.name ||
                userInfo?.email ||
                "SK Officer",
              status: "pending",
              referenceNo: `SK-EVT-${Date.now()}`,
              sourceType: "sk_event",
              sourceId: createdEvent.id,
            });
          } catch (disbursementError) {
            console.error("Failed to create disbursement for event", disbursementError);
            toast.warning("Event saved, but disbursement record could not be created.");
          }
        }

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
      {!readOnly ? (
        <>
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
            <select value={form.category} onChange={(e) => handleChange("category", e.target.value)} required>
              <option value="">Select Category</option>
              {DISBURSEMENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Budget"
              value={form.budget}
              onChange={(e) => handleChange("budget", e.target.value)}
            />
            <button type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Update Event" : "Add Event"}</button>
            {editingId ? (
              <button type="button" className="sk-secondary-btn" onClick={clearForm}>
                Cancel Edit
              </button>
            ) : null}
          </form>
        </>
      ) : null}

      {formOnly ? (
        <p className="sk-empty-state">Event list is hidden in add mode.</p>
      ) : sortedEvents.length === 0 ? (
        <p className="sk-empty-state">{readOnly ? "No events available yet." : "No events yet. Add an SK event to start the calendar."}</p>
      ) : (
        <ul>
          {sortedEvents.map((item) => (
            <li key={item.id}>
              <strong>{item.title || "Untitled Event"}</strong>
              <div className="sk-item-meta">
                <span>{formatDate(item.date || item.eventDate)}</span>
                <span>{item.location || "Location not set"}</span>
                <span>{item.category || "Miscellaneous"}</span>
                <span>Budget: ₱{Number(item.budget || 0).toLocaleString()}</span>
              </div>
              {!readOnly ? (
                <div className="sk-item-actions">
                  <button type="button" className="sk-secondary-btn" onClick={() => handleEdit(item)}>
                    Edit
                  </button>
                  <button type="button" className="sk-danger-btn" onClick={() => handleDelete(item.id)}>
                    Delete
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EventCalendar;
