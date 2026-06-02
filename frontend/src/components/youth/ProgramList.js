import { useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { toast } from "react-toastify";
import { db } from "../../services/firebase";
import { useUser } from "../../context/UserContext";
import { NotificationsAPI } from "../../services/api";
import "../../styles/sk.css";

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const date = toDate(value);
  if (!date) return "Date not set";
  return date.toLocaleDateString();
};

const toInputDate = (value) => {
  const date = toDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
};

const DISBURSEMENT_CATEGORIES = [
  "Salaries",
  "Supplies",
  "Utilities",
  "Infrastructure",
  "Health Programs",
  "Miscellaneous",
  "Others",
];

const ProgramList = ({ programs = [], formOnly = false, readOnly = false }) => {
  const { role, userInfo } = useUser();
  const [form, setForm] = useState({ title: "", date: "", category: "Miscellaneous", status: "Planned", budget: "" });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const sortedPrograms = useMemo(() => {
    return [...programs].sort((a, b) => {
      const aDate = new Date(a.date || a.createdAt?.toDate?.() || 0).getTime();
      const bDate = new Date(b.date || b.createdAt?.toDate?.() || 0).getTime();
      return aDate - bDate;
    });
  }, [programs]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const clearForm = () => {
    setForm({ title: "", date: "", category: "Miscellaneous", status: "Planned", budget: "" });
    setEditingId(null);
  };

  const handleEdit = (program) => {
    setEditingId(program.id);
    setForm({
      title: program.title || "",
      date: toInputDate(program.date),
      category: program.category || "Miscellaneous",
      status: program.status || "Planned",
      budget: program.budget != null ? String(program.budget) : "",
    });
  };

  const handleDelete = async (programId) => {
    if (!window.confirm("Delete this SK program?")) return;

    try {
      await deleteDoc(doc(db, "sk_programs", programId));

      // Keep treasurer expenses in sync by removing linked disbursement rows.
      const linkedDisbursements = await getDocs(
        query(collection(db, "disbursements"), where("sourceId", "==", programId))
      );
      const linkedDeleteTasks = linkedDisbursements.docs
        .filter((entry) => String(entry.data()?.sourceType || "").trim().toLowerCase() === "sk_program")
        .map((entry) => deleteDoc(doc(db, "disbursements", entry.id)));
      if (linkedDeleteTasks.length > 0) {
        await Promise.all(linkedDeleteTasks);
      }

      toast.success("Program deleted.");
      if (editingId === programId) {
        clearForm();
      }
    } catch (error) {
      console.error("Failed to delete SK program", error);
      toast.error("Failed to delete program.");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const budget = Number(form.budget);
    if (!form.title.trim() || !form.date || !form.category || !Number.isFinite(budget) || budget <= 0) {
      toast.error("Program title, date, category, and budget are required.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "sk_programs", editingId), {
          title: form.title.trim(),
          date: form.date,
          category: form.category,
          status: form.status,
          budget,
          updatedAt: serverTimestamp(),
        });
        toast.success("Program updated.");
      } else {
        const createdProgram = await addDoc(collection(db, "sk_programs"), {
          title: form.title.trim(),
          date: form.date,
          category: form.category,
          status: form.status,
          budget,
          createdAt: serverTimestamp(),
        });

        if (String(role || "").trim().toLowerCase() === "sk") {
          try {
            await addDoc(collection(db, "disbursements"), {
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
              referenceNo: `SK-PROG-${Date.now()}`,
              sourceType: "sk_program",
              sourceId: createdProgram.id,
              createdAt: serverTimestamp(),
            });

            try {
              await NotificationsAPI.createSkExpense(
                "program",
                form.title.trim(),
                form.category,
                budget,
              );
            } catch (notificationError) {
              console.error("Failed to notify treasurer about program expense", notificationError);
              toast.warning("Program and disbursement saved, but treasurer notification could not be created.");
            }
          } catch (disbursementError) {
            console.error("Failed to create disbursement for program", disbursementError);
            toast.warning("Program saved, but disbursement record could not be created.");
          }
        }

        toast.success("Program added.");
      }
      clearForm();
    } catch (error) {
      console.error("Failed to add SK program", error);
      toast.error("Failed to save program changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="program-list">
      {!readOnly ? (
        <>
          <h4 className="sk-form-title">{editingId ? "Edit Program" : "Add Program"}</h4>
          <form id="add-program-form" className="sk-inline-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Program title"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
            />
            <input
              type="date"
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
            />
            <select value={form.category} onChange={(e) => handleChange("category", e.target.value)} required>
              <option value="">Select Category</option>
              {DISBURSEMENT_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <select value={form.status} onChange={(e) => handleChange("status", e.target.value)}>
              <option value="Planned">Planned</option>
              <option value="Ongoing">Ongoing</option>
              <option value="Completed">Completed</option>
            </select>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Budget"
              value={form.budget}
              onChange={(e) => handleChange("budget", e.target.value)}
            />
            <button type="submit" disabled={saving}>{saving ? "Saving..." : editingId ? "Update Program" : "Add Program"}</button>
            {editingId ? (
              <button type="button" className="sk-secondary-btn" onClick={clearForm}>
                Cancel Edit
              </button>
            ) : null}
          </form>
        </>
      ) : null}

      {formOnly ? (
        <p className="sk-empty-state">Program list is hidden in add mode.</p>
      ) : sortedPrograms.length === 0 ? (
        <p className="sk-empty-state">{readOnly ? "No programs available yet." : "No programs yet. Add the first SK program above."}</p>
      ) : (
        <ul>
          {sortedPrograms.map((program) => (
            <li key={program.id}>
              <strong>{program.title || "Untitled Program"}</strong>
              <div className="sk-item-meta">
                <span>{formatDate(program.date)}</span>
                <span>{program.category || "General"}</span>
                <span>{program.status || "Planned"}</span>
                <span>Budget: ₱{Number(program.budget || 0).toLocaleString()}</span>
              </div>
              {!readOnly ? (
                <div className="sk-item-actions">
                  <button type="button" className="sk-secondary-btn" onClick={() => handleEdit(program)}>
                    Edit
                  </button>
                  <button type="button" className="sk-danger-btn" onClick={() => handleDelete(program.id)}>
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

export default ProgramList;
