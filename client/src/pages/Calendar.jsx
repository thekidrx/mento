import { useEffect, useState } from 'react';
import { MonthGrid } from '../components/MonthGrid';
import { api } from '../api';

export function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    try {
      const data = await api.getEvents();
      setEvents(data);
    } catch (err) {
      setError(err.message);
    }
  }

  function changeMonth(delta) {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 0) { newMonth = 11; newYear -= 1; }
    if (newMonth > 11) { newMonth = 0; newYear += 1; }
    setMonth(newMonth);
    setYear(newYear);
  }

  async function handleAddEvent(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createEvent({ title, description, date: selectedDate });
      setTitle('');
      setDescription('');
      setSelectedDate(null);
      loadEvents();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteEvent(id) {
    await api.deleteEvent(id);
    loadEvents();
  }

  return (
    <div className="calendar-page">
      <div className="calendar-controls">
        <button onClick={() => changeMonth(-1)}>&lt;</button>
        <span>{year}-{String(month + 1).padStart(2, '0')}</span>
        <button onClick={() => changeMonth(1)}>&gt;</button>
      </div>
      <MonthGrid year={year} month={month} events={events} onDayClick={setSelectedDate} />
      {selectedDate && (
        <form className="event-form" onSubmit={handleAddEvent}>
          <h2>Add event on {selectedDate}</h2>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
          />
          {error && <p className="error">{error}</p>}
          <button type="submit">Add</button>
          <button type="button" onClick={() => setSelectedDate(null)}>Cancel</button>
        </form>
      )}
      <ul className="event-list">
        {events
          .filter((e) => e.date === selectedDate)
          .map((event) => (
            <li key={event.id}>
              {event.title}
              <button onClick={() => handleDeleteEvent(event.id)}>Delete</button>
            </li>
          ))}
      </ul>
    </div>
  );
}
