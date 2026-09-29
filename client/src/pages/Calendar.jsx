import { useEffect, useState } from 'react';
import { MonthGrid } from '../components/MonthGrid';
import { api } from '../api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingEventId, setEditingEventId] = useState(null);
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

  function resetForm() {
    setTitle('');
    setDescription('');
    setEditingEventId(null);
  }

  function handleDayClick(date) {
    // Selecting a different day always means "add here", never "move the
    // event I was editing", so drop any in-progress edit.
    resetForm();
    setError('');
    setSelectedDate(date);
  }

  function startEditing(event) {
    setSelectedDate(event.date);
    setEditingEventId(event.id);
    setTitle(event.title);
    setDescription(event.description || '');
    setError('');
  }

  async function handleSubmitEvent(e) {
    e.preventDefault();
    setError('');
    try {
      if (editingEventId !== null) {
        await api.updateEvent(editingEventId, { title, description, date: selectedDate });
      } else {
        await api.createEvent({ title, description, date: selectedDate });
      }
      resetForm();
      loadEvents();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteEvent(id) {
    setError('');
    try {
      await api.deleteEvent(id);
      if (editingEventId === id) resetForm();
      loadEvents();
    } catch (err) {
      setError(err.message);
    }
  }

  const isEditing = editingEventId !== null;

  return (
    <div className="calendar-page">
      <div className="calendar-controls">
        <button onClick={() => changeMonth(-1)}>&lt;</button>
        <span>{MONTH_NAMES[month]} {year}</span>
        <button onClick={() => changeMonth(1)}>&gt;</button>
      </div>
      <MonthGrid year={year} month={month} events={events} onDayClick={handleDayClick} />
      {selectedDate && (
        <form className="event-form" onSubmit={handleSubmitEvent}>
          <h2>{isEditing ? 'Edit event' : 'Add event'} on {selectedDate}</h2>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" required />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
          />
          {error && <p className="error">{error}</p>}
          <button type="submit">{isEditing ? 'Save' : 'Add'}</button>
          {isEditing ? (
            <button type="button" onClick={resetForm}>Cancel edit</button>
          ) : (
            <button type="button" onClick={() => { resetForm(); setSelectedDate(null); }}>Cancel</button>
          )}
        </form>
      )}
      <ul className="event-list">
        {events
          .filter((e) => e.date === selectedDate)
          .map((event) => (
            <li key={event.id}>
              {event.title}
              <button onClick={() => startEditing(event)}>Edit</button>
              <button onClick={() => handleDeleteEvent(event.id)}>Delete</button>
            </li>
          ))}
      </ul>
    </div>
  );
}
