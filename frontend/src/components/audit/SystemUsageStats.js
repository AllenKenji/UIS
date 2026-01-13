import React from "react";
import "../../styles/admin.css";

const mockUsage = [
  { metric: "Logins (30 days)", value: 142 },
  { metric: "Documents Generated", value: 87 },
  { metric: "Complaints Filed", value: 23 },
];

const SystemUsageStats = () => (
  <div className="system-usage-stats">
    <h3>📊 System Usage</h3>
    <ul>
      {mockUsage.map((stat, index) => (
        <li key={index}>
          <strong>{stat.metric}</strong>: {stat.value}
        </li>
      ))}
    </ul>
  </div>
);

export default SystemUsageStats;
