import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useUser } from "../../context/UserContext";
import { DisbursementsAPI, notifyYouthDataChanged, NotificationsAPI, YouthProgramsAPI } from "../../services/api";
import { uploadLocalFile } from "../../utils/fileUtils";
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
  const [form, setForm] = useState({ title: "", date: "", category: "Miscellaneous", status: "Planned", budget: "", description: "", imageUrl: "" });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
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
    setForm({ title: "", date: "", category: "Miscellaneous", status: "Planned", budget: "", description: "", imageUrl: "" });
    setImageFile(null);
    setImagePreview("");
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
      description: program.description || "",
      imageUrl: program.imageUrl || "",
    });
    setImageFile(null);
    setImagePreview("");
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0] || null;
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : "");
  };

  const handleDelete = async (programId) => {
    if (!window.confirm("Delete this SK program?")) return;

    try {
      await YouthProgramsAPI.delete(programId);

      // Keep treasurer expenses in sync by removing linked disbursement rows.
      const linkedDeleteTasks = (await DisbursementsAPI.list())
        .filter((entry) => entry.sourceId === programId && String(entry.sourceType || "").trim().toLowerCase() === "sk_program")
        .map((entry) => DisbursementsAPI.delete(entry.id));
      if (linkedDeleteTasks.length > 0) {
        await Promise.all(linkedDeleteTasks);
      }

      notifyYouthDataChanged();
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
      // Upload the photo first (if a new one was picked) so imageUrl is
      // ready to go into the same create/update call as everything else —
      // this is what the barangay portal's Programs & Events section reads
      // (see public_routes._PROGRAM_FIELDS, already wired to display it).
      let imageUrl = form.imageUrl || null;
      if (imageFile) {
        const uploaded = await uploadLocalFile(userInfo?.uid || "sk", imageFile, "sk_programs", `${Date.now()}_${imageFile.name}`);
        imageUrl = uploaded.url;
      }

      if (editingId) {
        await YouthProgramsAPI.update(editingId, {
          title: form.title.trim(),
          date: form.date,
          category: form.category,
          status: form.status,
          budget,
          description: form.description.trim(),
          imageUrl,
        });
        const linkedDisbursement = (await DisbursementsAPI.list()).find(
          (entry) => entry.sourceId === editingId && String(entry.sourceType || "").trim().toLowerCase() === "sk_program"
        );
        if (linkedDisbursement) {
          await DisbursementsAPI.update(linkedDisbursement.id, { category: form.category, amount: budget, date: form.date, recipient: form.title.trim(), recipientName: form.title.trim() });
        }
        toast.success("Program updated.");
      } else {
        const createdProgram = await YouthProgramsAPI.create({
          title: form.title.trim(),
          date: form.date,
          category: form.category,
          status: form.status,
          budget,
          description: form.description.trim(),
          imageUrl,
        });

        if (String(role || "").trim().toLowerCase() === "sk") {
          try {
            await DisbursementsAPI.create({
              category: form.category,
              amount: budget,
              date: form.date,
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
              createdAt: new Date().toISOString(),
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
      notifyYouthDataChanged();
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
            <textarea
              className="sk-description-field"
              placeholder="Description (shown on the barangay portal)"
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
              rows={3}
            />
            <label className="sk-photo-field">
              Photo
              <input type="file" accept="image/*" onChange={handleImageChange} />
            </label>
            {(imagePreview || form.imageUrl) && (
              <img className="sk-photo-preview" src={imagePreview || form.imageUrl} alt="Program preview" />
            )}
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
              {program.imageUrl && (
                <img className="sk-item-photo" src={program.imageUrl} alt={program.title || "Program"} />
              )}
              <strong>{program.title || "Untitled Program"}</strong>
              <div className="sk-item-meta">
                <span>{formatDate(program.date)}</span>
                <span>{program.category || "General"}</span>
                <span>{program.status || "Planned"}</span>
                <span>Budget: ₱{Number(program.budget || 0).toLocaleString()}</span>
              </div>
              {program.description && <p className="sk-item-description">{program.description}</p>}
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
