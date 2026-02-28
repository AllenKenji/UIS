import "../../styles/admin.css";

const mockEvents = [
  { id: 1, title: "Tree Planting", date: "Oct 28, 2025", location: "Barangay Plaza" },
  { id: 2, title: "SK General Assembly", date: "Nov 5, 2025", location: "Covered Court" },
];

const EventCalendar = () => (
  <div className="event-calendar">
    <h3>📅 Upcoming Events</h3>
    <ul>
      {mockEvents.map((event) => (
        <li key={event.id}>
          <strong>{event.title}</strong><br />
          {event.date} — {event.location}
        </li>
      ))}
    </ul>
  </div>
);

export default EventCalendar;
