import { useEffect, useRef, useState } from 'react';
import { api, photoUrl } from '../api';
import { toDateKey } from './monthGridLogic';
import { formatLongDate, isUsableDate } from '../pages/photosLogic';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  PencilIcon,
  TrashIcon,
} from './Icons';

export function PhotoViewer({ photos, photoId, currentUserId, onNavigate, onClose, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draftDate, setDraftDate] = useState('');
  const [draftCaption, setDraftCaption] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closeButton = useRef(null);
  const deleting = useRef(false);
  // Images that already triggered a reload, so a missing file cannot loop.
  const reloadedFor = useRef(new Set());

  // Found by id, never by position: an edit can move a photo to another month.
  const index = photos.findIndex((p) => p.id === photoId);
  const photo = index === -1 ? null : photos[index];
  const previous = index > 0 ? photos[index - 1] : null;
  const next = index !== -1 && index < photos.length - 1 ? photos[index + 1] : null;

  // Deleted elsewhere, or gone after a reload: there is nothing to show.
  useEffect(() => {
    if (!photo && !deleting.current) onClose();
  }, [photo]);

  // Take focus on open, hand it back on close, and stop the page behind scrolling.
  useEffect(() => {
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (closeButton.current) closeButton.current.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, []);

  // Moving to another photo drops any half-finished edit or confirmation.
  useEffect(() => {
    setEditing(false);
    setConfirmingDelete(false);
    setError('');
  }, [photoId]);

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (editing) setEditing(false);
        else if (confirmingDelete) setConfirmingDelete(false);
        else onClose();
        return;
      }
      const typing = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);
      if (typing || editing) return;
      if (e.key === 'ArrowLeft' && previous) onNavigate(previous.id);
      if (e.key === 'ArrowRight' && next) onNavigate(next.id);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!photo) return null;

  const mine = photo.created_by === currentUserId;
  const today = toDateKey(new Date());

  function startEditing() {
    setDraftDate(photo.taken_on);
    setDraftCaption(photo.caption || '');
    setConfirmingDelete(false);
    setError('');
    setEditing(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (saving) return;
    if (!isUsableDate(draftDate)) {
      setError("Choose a date that isn't in the future.");
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.updatePhoto(photo.id, { taken_on: draftDate, caption: draftCaption });
      await onChanged();
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting.current) return;
    deleting.current = true;
    setError('');
    // Decided before deleting, while this photo still has neighbours.
    const showNext = next || previous;
    try {
      await api.deletePhoto(photo.id);
    } catch (err) {
      // Already gone is what was asked for; anything else is a real failure.
      if (err.status !== 404) {
        deleting.current = false;
        setError(err.message);
        return;
      }
    }
    await onChanged();
    deleting.current = false;
    if (showNext) onNavigate(showNext.id);
    else onClose();
  }

  // The file is gone (the other person deleted it): refresh so it disappears.
  function handleImageError() {
    if (reloadedFor.current.has(photo.id)) return;
    reloadedFor.current.add(photo.id);
    onChanged();
  }

  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label="Photo">
      <button
        ref={closeButton}
        type="button"
        className="photo-viewer-close"
        aria-label="Close photo"
        onClick={onClose}
      >
        <CloseIcon size={22} />
      </button>

      <div className="photo-viewer-stage">
        <button
          type="button"
          className="photo-viewer-nav"
          aria-label="Previous photo"
          disabled={!previous}
          onClick={() => onNavigate(previous.id)}
        >
          <ChevronLeftIcon size={24} />
        </button>
        <img
          key={photo.id}
          className="photo-viewer-image"
          src={photoUrl(photo.id)}
          alt={photo.caption || `Photo from ${photo.taken_on}`}
          onError={handleImageError}
        />
        <button
          type="button"
          className="photo-viewer-nav"
          aria-label="Next photo"
          disabled={!next}
          onClick={() => onNavigate(next.id)}
        >
          <ChevronRightIcon size={24} />
        </button>
      </div>

      <div className="photo-viewer-info">
        {editing ? (
          <form className="photo-viewer-form" onSubmit={handleSave}>
            <label className="field">
              <span className="field-label">Date</span>
              <input
                type="date"
                value={draftDate}
                max={today}
                onChange={(e) => setDraftDate(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span className="field-label">Caption</span>
              <input
                value={draftCaption}
                maxLength={200}
                placeholder="Add a caption (optional)"
                onChange={(e) => setDraftCaption(e.target.value)}
              />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>Save</button>
              <button type="button" className="btn btn-on-dark" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            {photo.caption && <p className="photo-viewer-caption">{photo.caption}</p>}
            <p className="photo-viewer-meta">
              {formatLongDate(photo.taken_on)} · Added by {photo.display_name}
            </p>
            {error && <p className="error" role="alert">{error}</p>}
            {mine && !confirmingDelete && (
              <div className="form-actions">
                <button type="button" className="btn btn-on-dark" onClick={startEditing}>
                  <PencilIcon size={16} />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  className="btn btn-on-dark"
                  onClick={() => setConfirmingDelete(true)}
                >
                  <TrashIcon size={16} />
                  <span>Delete</span>
                </button>
              </div>
            )}
            {mine && confirmingDelete && (
              <div className="photo-viewer-confirm" role="alertdialog" aria-label="Delete photo">
                <p>Delete this photo?</p>
                <div className="form-actions">
                  <button type="button" className="btn btn-danger" onClick={handleDelete}>
                    Delete
                  </button>
                  <button
                    type="button"
                    className="btn btn-on-dark"
                    onClick={() => setConfirmingDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
