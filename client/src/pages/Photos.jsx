import { useEffect, useRef, useState } from 'react';
import { api, thumbUrl } from '../api';
import { CuteCat } from '../components/CuteCat';
import { PlusIcon } from '../components/Icons';
import { PhotoUploader } from '../components/PhotoUploader';
import { PhotoViewer } from '../components/PhotoViewer';
import { useRefreshOnVisible } from '../components/useRefreshOnVisible';
import { MAX_BATCH, groupByMonth } from './photosLogic';

export function PhotosPage({ currentUserId }) {
  const [photos, setPhotos] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [batch, setBatch] = useState(null);
  const [openPhotoId, setOpenPhotoId] = useState(null);
  const fileInput = useRef(null);
  const nextBatchId = useRef(1);
  // Thumbnails that already triggered a reload, so a missing file cannot loop.
  const reloadedFor = useRef(new Set());

  async function loadPhotos() {
    try {
      setPhotos(await api.getPhotos());
      setLoaded(true);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadPhotos();
  }, []);

  useRefreshOnVisible(() => {
    if (batch === null && openPhotoId === null) loadPhotos();
  });

  function handleFilesChosen(e) {
    const chosen = Array.from(e.target.files || []);
    // Cleared so that picking the same file again still fires "change".
    e.target.value = '';
    if (chosen.length === 0) return;
    setNotice(
      chosen.length > MAX_BATCH ? `Only the first ${MAX_BATCH} photos were added.` : ''
    );
    setBatch({ id: nextBatchId.current, files: chosen.slice(0, MAX_BATCH) });
    nextBatchId.current += 1;
  }

  // The other person may have deleted it; reloading drops it from the grid.
  function handleThumbError(id) {
    if (reloadedFor.current.has(id)) return;
    reloadedFor.current.add(id);
    loadPhotos();
  }

  const groups = groupByMonth(photos);

  return (
    <div className="photos-page">
      <div className="page-heading photos-heading">
        <div>
          <h1 className="page-title">Photos</h1>
          <p className="page-subtitle">Our memories, month by month.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={batch !== null}
          onClick={() => fileInput.current.click()}
        >
          <PlusIcon size={18} />
          <span>Add photos</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFilesChosen}
        />
      </div>

      {notice && <p className="banner" role="status">{notice}</p>}
      {batch && (
        <PhotoUploader
          key={batch.id}
          files={batch.files}
          onUploaded={loadPhotos}
          onDone={() => {
            setBatch(null);
            setNotice('');
          }}
        />
      )}
      {error && <p className="error" role="alert">{error}</p>}

      {loaded && photos.length === 0 && batch === null && (
        <div className="empty-state card">
          <CuteCat className="empty-mascot" />
          <p className="empty-title">No photos yet</p>
          <p className="empty-text">Add your first one to start the timeline.</p>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.key} className="photo-month">
          <h2 className="photo-month-title">{group.label}</h2>
          <div className="photo-grid">
            {group.photos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                className="photo-thumb"
                onClick={() => setOpenPhotoId(photo.id)}
              >
                <img
                  src={thumbUrl(photo.id)}
                  loading="lazy"
                  alt={photo.caption || `Photo from ${photo.taken_on}`}
                  onError={() => handleThumbError(photo.id)}
                />
              </button>
            ))}
          </div>
        </section>
      ))}

      {openPhotoId !== null && (
        <PhotoViewer
          photos={photos}
          photoId={openPhotoId}
          currentUserId={currentUserId}
          onNavigate={setOpenPhotoId}
          onClose={() => setOpenPhotoId(null)}
          onChanged={loadPhotos}
        />
      )}
    </div>
  );
}
