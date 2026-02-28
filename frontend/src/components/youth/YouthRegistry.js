import "../../styles/admin.css";

const mockYouth = [
  { id: 1, name: "Ana Reyes", age: 17, status: "Active" },
  { id: 2, name: "Mark Cruz", age: 19, status: "Inactive" },
];

const YouthRegistry = () => (
  <div className="youth-registry">
    <h3>📋 Youth Registry</h3>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Age</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {mockYouth.map((youth) => (
          <tr key={youth.id}>
            <td>{youth.name}</td>
            <td>{youth.age}</td>
            <td>{youth.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default YouthRegistry;
