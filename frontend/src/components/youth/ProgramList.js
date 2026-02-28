import "../../styles/admin.css";

const mockPrograms = [
  { id: 1, title: "Clean & Green Drive", date: "Oct 25, 2025" },
  { id: 2, title: "Youth Leadership Seminar", date: "Nov 10, 2025" },
];

const ProgramList = () => (
  <div className="program-list">
    <h3>🎯 Youth Programs</h3>
    <ul>
      {mockPrograms.map((program) => (
        <li key={program.id}>
          <strong>{program.title}</strong> — {program.date}
        </li>
      ))}
    </ul>
  </div>
);

export default ProgramList;
