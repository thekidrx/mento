import { useEffect, useState } from 'react';
import { MonthGrid } from '../components/MonthGrid';
import { toDateKey } from '../components/monthGridLogic';
import { CuteCat } from '../components/CuteCat';
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, TrashIcon } from '../components/Icons';
import { api } from '../api';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatLongDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

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

  function goToToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    handleDayClick(toDateKey(now));
  }

  const isEditing = editingEventId !== null;
  const dayEvents = events.filter((e) => e.date === selectedDate);

  return (
    <div className="calendar-page">
      <div className="page-heading calendar-controls">
        <h1 className="page-title">{MONTH_NAMES[month]} <span className="page-title-year">{year}</span></h1>
        <div className="calendar-nav">
          <button type="button" className="btn btn-soft" onClick={goToToday}>Today</button>
          <button type="button" className="btn btn-soft btn-round" aria-label="Previous month" onClick={() => changeMonth(-1)}>
            <ChevronLeftIcon size={18} />
          </button>
          <button type="button" className="btn btn-soft btn-round" aria-label="Next month" onClick={() => changeMonth(1)}>
            <ChevronRightIcon size={18} />
          </button>
        </div>
      </div>
      <div className="calendar-layout">
        <MonthGrid
          year={year}
          month={month}
          events={events}
          selectedDate={selectedDate}
          onDayClick={handleDayClick}
        />
        <aside className="day-panel card">
          {!selectedDate ? (
            <div className="empty-state">
              <CuteCat className="empty-mascot" />
              <p className="empty-title">Pick a day</p>
              <p className="empty-text">Tap any date to see what's planned or add something new.</p>
              {error && <p className="error" role="alert">{error}</p>}
            </div>
          ) : (
            <>
              <p className="day-panel-eyebrow">{isEditing ? 'Editing plan' : 'Plans for'}</p>
              <h2 className="day-panel-title">{formatLongDate(selectedDate)}</h2>
              {dayEvents.length > 0 ? (
                <ul className="event-list">
                  {dayEvents.map((event) => (
                    <li key={event.id} className={event.id === editingEventId ? 'editing' : undefined}>
                      <div className="event-text">
                        <span className="event-title">{event.title}</span>
                        {event.description && <span className="event-description">{event.description}</span>}
                      </div>
                      <div className="event-actions">
                        <button type="button" className="icon-btn" aria-label={`Edit ${event.title}`} onClick={() => startEditing(event)}>
                          <PencilIcon size={16} />
                        </button>
                        <button type="button" className="icon-btn danger" aria-label={`Delete ${event.title}`} onClick={() => handleDeleteEvent(event.id)}>
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Nothing planned yet.</p>
              )}
              <form className="event-form" onSubmit={handleSubmitEvent}>
                <label className="field">
                  <span className="field-label">{isEditing ? 'Title' : 'Add a plan'}</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner, movie night…" required />
                </label>
                <label className="field">
                  <span className="field-label">Details <span className="field-optional">optional</span></span>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Time, place, anything to remember"
                  />
                </label>
                {error && <p className="error" role="alert">{error}</p>}
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">{isEditing ? 'Save' : 'Add'}</button>
                  {isEditing ? (
                    <button type="button" className="btn btn-ghost" onClick={resetForm}>Cancel edit</button>
                  ) : (
                    <button type="button" className="btn btn-ghost" onClick={() => { resetForm(); setSelectedDate(null); }}>Close</button>
                  )}
                </div>
              </form>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
