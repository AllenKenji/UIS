import { useState } from "react";
import "../../styles/fee-dashboard.css";

export default function FeeTable({ title, columns, data, onUpdate, onDelete }) {
  const [editingId, setEditingId] = useState(null);

  const handleChange = (item, col, e) => {
    let value;
    if (col.type === "checkbox") {
      value = e.target.checked;
    } else if (col.type === "number") {
      value = Number(e.target.value);
    } else {
      value = e.target.value;
    }
    // Update the specific field immediately
    onUpdate(item.id, col.key, value, item);
  };

  return (
    <div className="fee-section">
      <h2>{title}</h2>
      <table className="fee-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key}>{col.label}</th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map(item => {
            const isEditing = editingId === item.id;
            return (
              <tr key={item.id}>
                {columns.map(col => (
                  <td key={col.key}>
                    {col.editable && isEditing ? (
                      col.type === "checkbox" ? (
                        <input
                          type="checkbox"
                          checked={!!item[col.key]}
                          onChange={e => handleChange(item, col, e)}
                        />
                      ) : col.type === "select" ? (
                        <select
                          value={item[col.key] ?? col.defaultValue ?? ""}
                          onChange={e => handleChange(item, col, e)}
                        >
                          {(col.options || []).map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={col.type || "text"}
                          step={col.type === "number" ? "any" : undefined}
                          min={col.type === "number" ? "0" : undefined}
                          value={item[col.key] ?? ""}
                          onChange={e => handleChange(item, col, e)}
                        />
                      )
                    ) : col.type === "checkbox" ? (
                      item[col.key] ? "Yes" : "No"
                    ) : (
                      item[col.key]?.toString() ?? "—"
                    )}
                  </td>
                ))}
                <td>
                  <button onClick={() => setEditingId(isEditing ? null : item.id)}>
                    {isEditing ? "Done" : "Edit"}
                  </button>
                  <button onClick={() => onDelete(item.id)}>Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
