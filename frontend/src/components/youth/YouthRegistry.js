import "../../styles/sk.css";

const YouthRegistry = ({ residents = [], loading = false }) => {
  return (
    <div className="youth-registry">
      {loading ? (
        <p className="sk-empty-state">Loading youth registry...</p>
      ) : residents.length === 0 ? (
        <p className="sk-empty-state">No youth residents found yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Age</th>
              <th>Barangay</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {residents.map((resident) => (
              <tr key={resident.id || resident.uid}>
                <td>{resident.fullName || resident.name || "Unnamed"}</td>
                <td>{resident.age ?? "-"}</td>
                <td>{resident.address?.barangay || resident.barangay || "-"}</td>
                <td>{resident.status || "Active"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default YouthRegistry;
