import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { toDateKey } from './monthGridLogic';
import { resizeToJpeg } from '../pages/imageResize';
import {
  PHOTO_MAX_SIDE,
  PHOTO_QUALITY,
  THUMB_MAX_SIDE,
  THUMB_QUALITY,
  defaultTakenOn,
  isUsableDate,
} from '../pages/photosLogic';
import { CloseIcon } from './Icons';

// Holds the photos that were picked but not yet uploaded. Nothing is saved
// until Upload is pressed.
export function PhotoUploader({ files, onUploaded, onDone }) {
  const [entries, setEntries] = useState(() =>
    files.map((file, index) => ({
      key: `${index}-${file.name}-${file.size}`,
      file,
      previewUrl: null,
      taken_on: defaultTakenOn(file.lastModified),
      caption: '',
      error: '',
    }))
  );
  const [unreadable, setUnreadable] = useState([]);
  const [progress, setProgress] = useState(null);
  // A ref, not state: two taps in the same tick both see the old state.
  const uploading = useRef(false);

  // Preview addresses are made here rather than in the initial state so that
  // each one made is also released.
  useEffect(() => {
    const urls = new Map(files.map((file, index) => [index, URL.createObjectURL(file)]));
    setEntries((current) =>
      current.map((entry) => {
        const index = files.indexOf(entry.file);
        return { ...entry, previewUrl: urls.get(index) || null };
      })
    );
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  const today = toDateKey(new Date());
  const busy = progress !== null;

  function update(key, changes) {
    setEntries((current) =>
      current.map((entry) => (entry.key === key ? { ...entry, ...changes } : entry))
    );
  }

  function remove(key) {
    const remaining = entries.filter((entry) => entry.key !== key);
    setEntries(remaining);
    if (remaining.length === 0) onDone();
  }

  // The browser could not show the file, so it is not a photo it can shrink.
  function rejectUnreadable(entry) {
    setUnreadable((names) => [...names, entry.file.name]);
    setEntries((current) => current.filter((item) => item.key !== entry.key));
  }

  async function uploadAll() {
    if (uploading.current) return;
    uploading.current = true;
    const queue = entries;
    let failed = 0;

    for (let i = 0; i < queue.length; i += 1) {
      const entry = queue[i];
      setProgress({ current: i + 1, total: queue.length });
      if (!isUsableDate(entry.taken_on)) {
        update(entry.key, { error: "Choose a date that isn't in the future." });
        failed += 1;
        continue;
      }
      try {
        const image = await resizeToJpeg(entry.file, PHOTO_MAX_SIDE, PHOTO_QUALITY);
        const thumb = await resizeToJpeg(entry.file, THUMB_MAX_SIDE, THUMB_QUALITY);
        await api.uploadPhoto({
          image,
          thumb,
          taken_on: entry.taken_on,
          caption: entry.caption,
        });
        setEntries((current) => current.filter((item) => item.key !== entry.key));
        onUploaded();
      } catch (err) {
        update(entry.key, { error: err.message });
        failed += 1;
      }
    }

    uploading.current = false;
    setProgress(null);
    if (failed === 0) onDone();
  }

  const count = entries.length;

  return (
    <section className="photo-staging card" aria-label="Photos to upload">
      {unreadable.map((name) => (
        <p key={name} className="error" role="alert">Couldn't read {name}</p>
      ))}
      {count === 0 && unreadable.length > 0 && (
        <div className="form-actions end">
          <button type="button" className="btn btn-soft" onClick={onDone}>Close</button>
        </div>
      )}
      <ul className="photo-staged-list">
        {entries.map((entry) => (
          <li key={entry.key} className="photo-staged">
            {entry.previewUrl ? (
              <img
                className="photo-staged-preview"
                src={entry.previewUrl}
                alt=""
                onError={() => rejectUnreadable(entry)}
              />
            ) : (
              <span className="photo-staged-preview" />
            )}
            <div className="photo-staged-fields">
              <label className="field">
                <span className="field-label">Date</span>
                <input
                  type="date"
                  value={entry.taken_on}
                  max={today}
                  disabled={busy}
                  onChange={(e) => update(entry.key, { taken_on: e.target.value, error: '' })}
                />
              </label>
              <label className="field">
                <span className="field-label">
                  Caption <span className="field-optional">optional</span>
                </span>
                <input
                  value={entry.caption}
                  maxLength={200}
                  placeholder="Add a caption (optional)"
                  disabled={busy}
                  onChange={(e) => update(entry.key, { caption: e.target.value })}
                />
              </label>
              {entry.error && <p className="error" role="alert">{entry.error}</p>}
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${entry.file.name}`}
              disabled={busy}
              onClick={() => remove(entry.key)}
            >
              <CloseIcon size={18} />
            </button>
          </li>
        ))}
      </ul>
      {count > 0 && (
        <div className="form-actions end">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={uploadAll}>
            {busy
              ? `Uploading ${progress.current} of ${progress.total}`
              : `Upload ${count} ${count === 1 ? 'photo' : 'photos'}`}
          </button>
        </div>
      )}
    </section>
  );
}
