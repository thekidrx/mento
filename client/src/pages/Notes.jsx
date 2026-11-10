import { useEffect, useState } from 'react';
import { api } from '../api';
import { canDeleteNote, formatNoteTime } from './notesLogic';
import { CuteCat } from '../components/CuteCat';
import { TrashIcon } from '../components/Icons';

export function NotesPage({ currentUserId }) {
  const [notes, setNotes] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    try {
      const data = await api.getNotes();
      setNotes(data);
      setLoaded(true);
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
    setError('');
    try {
      await api.deleteNote(id);
      loadNotes();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="notes-page">
      <div className="page-heading">
        <h1 className="page-title">Notes</h1>
        <p className="page-subtitle">Little messages for each other.</p>
      </div>
      <form className="note-compose card" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="note-message">Leave a note</label>
        <textarea
          id="note-message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Leave a note…"
          required
        />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="form-actions end">
          <button type="submit" className="btn btn-primary">Post note</button>
        </div>
      </form>
      {!loaded ? null : notes.length === 0 ? (
        <div className="empty-state card">
          <CuteCat className="empty-mascot" />
          <p className="empty-title">No notes yet</p>
          <p className="empty-text">Be the first to leave something sweet.</p>
        </div>
      ) : (
        <ul className="notes-list">
          {notes.map((note) => {
            const mine = canDeleteNote(note, currentUserId);
            return (
              <li key={note.id} className={`note card${mine ? ' mine' : ''}`}>
                <span className="avatar" aria-hidden="true">
                  {(note.display_name || '?').charAt(0).toUpperCase()}
                </span>
                <div className="note-body">
                  <div className="note-meta">
                    <strong className="note-author">{note.display_name}</strong>
                    <time className="note-timestamp" title={`${note.created_at} UTC`}>
                      {formatNoteTime(note.created_at)}
                    </time>
                  </div>
                  <p className="note-message">{note.message}</p>
                </div>
                {mine && (
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label="Delete note"
                    onClick={() => handleDelete(note.id)}
                  >
                    <TrashIcon size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
