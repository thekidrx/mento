import { describe, it, expect } from 'vitest';
import { canDeleteNote, formatNoteTime } from '../pages/notesLogic';

describe('canDeleteNote', () => {
  it('returns true when the note belongs to the current user', () => {
    expect(canDeleteNote({ created_by: 1 }, 1)).toBe(true);
  });

  it('returns false when the note belongs to someone else', () => {
    expect(canDeleteNote({ created_by: 2 }, 1)).toBe(false);
  });
});

describe('formatNoteTime', () => {
  // Server timestamps are SQLite "YYYY-MM-DD HH:MM:SS" strings in UTC.
  const now = new Date('2026-11-09T18:00:00Z');

  it('says "just now" for under a minute', () => {
    expect(formatNoteTime('2026-11-09 17:59:30', now)).toBe('just now');
  });

  it('treats a timestamp slightly in the future as "just now"', () => {
    expect(formatNoteTime('2026-11-09 18:00:05', now)).toBe('just now');
  });

  it('counts minutes', () => {
    expect(formatNoteTime('2026-11-09 17:59:00', now)).toBe('1 minute ago');
    expect(formatNoteTime('2026-11-09 17:15:00', now)).toBe('45 minutes ago');
  });

  it('counts hours', () => {
    expect(formatNoteTime('2026-11-09 17:00:00', now)).toBe('1 hour ago');
    expect(formatNoteTime('2026-11-09 13:00:00', now)).toBe('5 hours ago');
  });

  it('counts days up to a week', () => {
    expect(formatNoteTime('2026-11-08 18:00:00', now)).toBe('yesterday');
    expect(formatNoteTime('2026-11-06 18:00:00', now)).toBe('3 days ago');
  });

  it('falls back to a calendar date after a week', () => {
    expect(formatNoteTime('2026-09-28 12:00:00', now)).toMatch(/Sep(tember)? 28, 2026/);
  });

  it('returns an empty string for a missing or unparseable timestamp', () => {
    expect(formatNoteTime(undefined, now)).toBe('');
    expect(formatNoteTime('not a date', now)).toBe('');
  });
});
