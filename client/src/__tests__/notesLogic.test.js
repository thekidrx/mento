import { describe, it, expect } from 'vitest';
import { canDeleteNote } from '../pages/notesLogic';

describe('canDeleteNote', () => {
  it('returns true when the note belongs to the current user', () => {
    expect(canDeleteNote({ created_by: 1 }, 1)).toBe(true);
  });

  it('returns false when the note belongs to someone else', () => {
    expect(canDeleteNote({ created_by: 2 }, 1)).toBe(false);
  });
});
