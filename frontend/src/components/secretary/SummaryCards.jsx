import "../../styles/secretary/summary-cards.css";

const SummaryCards = ({ stats }) => {
  const cards = [
    { key: "total", label: "Total Requests" },
    { key: "pending", label: "Pending" },
    { key: "for_payment", label: "For Payment" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="summary-cards">
      {cards.map(({ key, label }) => (
        <div className="card" key={key}>
          <h3>{stats[key] ?? 0}</h3>
          <p>{label}</p>
        </div>
      ))}
    </div>
  );
};

export default SummaryCards;
