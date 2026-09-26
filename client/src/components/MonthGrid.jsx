import { getMonthGridDays, toDateKey } from './monthGridLogic';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthGrid({ year, month, events, onDayClick }) {
  const days = getMonthGridDays(year, month);
  const eventsByDate = {};
  for (const event of events) {
    if (!eventsByDate[event.date]) eventsByDate[event.date] = [];
    eventsByDate[event.date].push(event);
  }

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
          return (
            <div key={i} className="month-grid-cell" onClick={() => onDayClick(key)}>
              <div className="month-grid-date">{date.getDate()}</div>
              {dayEvents.map((event) => (
                <div key={event.id} className="month-grid-event">{event.title}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
