export function canDeleteNote(note, currentUserId) {
  return note.created_by === currentUserId;
}
