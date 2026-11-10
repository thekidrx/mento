export function canDeleteNote(note, currentUserId) {
  return note.created_by === currentUserId;
}

function plural(n, unit) {
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

// Server timestamps are SQLite "YYYY-MM-DD HH:MM:SS" strings in UTC.
export function formatNoteTime(createdAt, now = new Date()) {
  if (typeof createdAt !== 'string') return '';
  const then = new Date(createdAt.replace(' ', 'T') + 'Z');
  if (Number.isNaN(then.getTime())) return '';

  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, 'hour');
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return plural(days, 'day');
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
