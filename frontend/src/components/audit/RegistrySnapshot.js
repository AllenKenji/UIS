import React from "react";
import "../../styles/admin.css";

const mockSnapshot = [
  { registry: "Residents", entries: 1245 },
  { registry: "Businesses", entries: 312 },
  { registry: "Youth", entries: 198 },
];

const RegistrySnapshot = () => (
  <div className="registry-snapshot">
    <h3>📁 Registry Snapshot</h3>
    <table>
      <thead>
        <tr>
          <th>Registry</th>
          <th>Total Entries</th>
        </tr>
      </thead>
      <tbody>
        {mockSnapshot.map((r, index) => (
          <tr key={index}>
            <td>{r.registry}</td>
            <td>{r.entries}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default RegistrySnapshot;
