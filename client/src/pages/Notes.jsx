import { useEffect, useState } from 'react';
import { api } from '../api';
import { canDeleteNote } from './notesLogic';

export function NotesPage({ currentUserId }) {
  const [notes, setNotes] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    try {
      const data = await api.getNotes();
      setNotes(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.createNote(message);
      setMessage('');
      loadNotes();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    await api.deleteNote(id);
    loadNotes();
  }

  return (
    <div className="notes-page">
      <form onSubmit={handleSubmit}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Leave a note..."
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit">Post</button>
      </form>
      <ul className="notes-list">
        {notes.map((note) => (
          <li key={note.id}>
            <strong>{note.display_name}</strong>: {note.message}
            {canDeleteNote(note, currentUserId) && (
              <button onClick={() => handleDelete(note.id)}>Delete</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
