import { getMonthGridDays, toDateKey } from './monthGridLogic';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE_EVENTS = 2;

export function MonthGrid({ year, month, events, selectedDate, onDayClick }) {
  const days = getMonthGridDays(year, month);
  const eventsByDate = {};
  for (const event of events) {
    if (!eventsByDate[event.date]) eventsByDate[event.date] = [];
    eventsByDate[event.date].push(event);
  }
  const todayKey = toDateKey(new Date());

  return (
    <div className="month-grid">
      <div className="month-grid-header">
        {WEEKDAYS.map((day) => (
          <div key={day} className="month-grid-weekday">{day}</div>
        ))}
      </div>
      <div className="month-grid-body">
        {days.map((date, i) => {
          if (!date) return <div key={i} className="month-grid-cell empty" />;
          const key = toDateKey(date);
          const dayEvents = eventsByDate[key] || [];
          const isToday = key === todayKey;
          const isSelected = key === selectedDate;
          const hidden = dayEvents.length - MAX_VISIBLE_EVENTS;
          return (
            <button
              key={i}
              type="button"
              className={`month-grid-cell${isSelected ? ' selected' : ''}`}
              aria-pressed={isSelected}
              onClick={() => onDayClick(key)}
            >
              <span className={`month-grid-date${isToday ? ' today' : ''}`}>{date.getDate()}</span>
              {dayEvents.slice(0, MAX_VISIBLE_EVENTS).map((event) => (
                <span key={event.id} className="month-grid-event">{event.title}</span>
              ))}
              {hidden > 0 && <span className="month-grid-more">+{hidden} more</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
