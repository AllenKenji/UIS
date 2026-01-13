import "../../styles/fee-dashboard.css";

export default function FeeTable({ title, columns, data, onUpdate, onDelete }) {
  const handleChange = (item, col, e) => {
    let value;
    if (col.type === "checkbox") {
      value = e.target.checked;
    } else if (col.type === "number") {
      value = Number(e.target.value);
    } else {
      value = e.target.value;
    }
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
          {data.map(item => (
            <tr key={item.id}>
              {columns.map(col => (
                <td key={col.key}>
                  {col.editable ? (
                    col.type === "checkbox" ? (
                      <input
                        type="checkbox"
                        checked={!!item[col.key]}
                        onChange={e => handleChange(item, col, e)}
                      />
                    ) : (
                      <input
                        type={col.type || "text"}
                        value={item[col.key] ?? ""}
                        onChange={e => handleChange(item, col, e)}
                      />
                    )
                  ) : (
                    item[col.key]?.toString() ?? "—"
                  )}
                </td>
              ))}
              <td>
                <button onClick={() => onUpdate(item.id, null, null, item)}>Save</button>
                <button onClick={() => onDelete(item.id)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
