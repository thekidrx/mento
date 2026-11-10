const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { decodeJpeg, isValidTakenOn, cleanCaption, MAX_CAPTION_LENGTH } = require('../photoValidation');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_THUMB_BYTES = 300 * 1024;

// Columns are named one by one so file_key can never reach a response.
const PHOTO_SELECT = `SELECT photos.id, photos.taken_on, photos.caption, photos.created_by,
         photos.created_at, users.display_name
  FROM photos
  JOIN users ON users.id = photos.created_by`;

function createPhotosRouter(db, photosDir) {
  const router = express.Router();
  fs.mkdirSync(photosDir, { recursive: true });

  function publicPhoto(id) {
    return db.prepare(`${PHOTO_SELECT} WHERE photos.id = ?`).get(id);
  }

  // Sends the error response and returns null when a field is unusable.
  function readJpeg(res, value, maxBytes) {
    const result = decodeJpeg(value, maxBytes);
    if (result.problem === 'too_large') {
      res.status(413).json({ error: 'Photo is too large' });
      return null;
    }
    if (result.problem) {
      res.status(400).json({ error: 'Photo must be a JPEG image' });
      return null;
    }
    return result.buffer;
  }

  // Returns { ok, taken_on, caption }, having sent the 400 when ok is false.
  function readDetails(req, res) {
    const { taken_on: takenOn } = req.body;
    if (!isValidTakenOn(takenOn)) {
      res.status(400).json({ error: 'A valid date is required' });
      return { ok: false };
    }
    const caption = cleanCaption(req.body.caption);
    if (caption.problem) {
      res
        .status(400)
        .json({ error: `Caption must be ${MAX_CAPTION_LENGTH} characters or fewer` });
      return { ok: false };
    }
    return { ok: true, taken_on: takenOn, caption: caption.value };
  }

  router.get('/', (req, res) => {
    const photos = db
      .prepare(`${PHOTO_SELECT} ORDER BY photos.taken_on DESC, photos.id DESC`)
      .all();
    res.json(photos);
  });

  router.post('/', (req, res) => {
    const image = readJpeg(res, req.body.image, MAX_IMAGE_BYTES);
    if (!image) return;
    const thumb = readJpeg(res, req.body.thumb, MAX_THUMB_BYTES);
    if (!thumb) return;
    const details = readDetails(req, res);
    if (!details.ok) return;

    // The name comes from the server only, never from the request.
    const fileKey = crypto.randomBytes(16).toString('hex');
    const imagePath = path.join(photosDir, `${fileKey}.jpg`);
    const thumbPath = path.join(photosDir, `${fileKey}.thumb.jpg`);

    let id;
    try {
      fs.writeFileSync(imagePath, image);
      fs.writeFileSync(thumbPath, thumb);
      id = db
        .prepare(
          'INSERT INTO photos (file_key, taken_on, caption, created_by) VALUES (?, ?, ?, ?)'
        )
        .run(fileKey, details.taken_on, details.caption, req.session.userId).lastInsertRowid;
    } catch (err) {
      // Without a row nothing points at these files, so do not leave them behind.
      fs.rmSync(imagePath, { force: true });
      fs.rmSync(thumbPath, { force: true });
      throw err;
    }
    res.status(201).json(publicPhoto(id));
  });

  // The full row, including file_key. Only a plain number can match, so
  // nothing path-like from the URL ever gets near the filesystem.
  function findPhoto(id) {
    if (!/^\d+$/.test(id)) return undefined;
    return db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
  }

  function filePaths(row) {
    return {
      image: path.join(photosDir, `${row.file_key}.jpg`),
      thumb: path.join(photosDir, `${row.file_key}.thumb.jpg`),
    };
  }

  function sendFile(which) {
    return (req, res) => {
      const row = findPhoto(req.params.id);
      if (!row) {
        return res.status(404).json({ error: 'Photo not found' });
      }
      const stream = fs.createReadStream(filePaths(row)[which]);
      let failed = false;
      // Without this listener a missing or unreadable file would be an
      // uncaught exception and take the whole server down.
      stream.on('error', () => {
        if (failed) return;
        failed = true;
        if (res.headersSent) {
          res.destroy();
          return;
        }
        // Set for the image; they must not describe the error reply.
        res.removeHeader('Content-Type');
        res.removeHeader('Cache-Control');
        res.status(404).json({ error: 'Photo not found' });
      });
      // Headers go out only once the file has opened, so a missing file is a
      // clean 404. pipeline also closes the file if the client goes away.
      stream.on('open', () => {
        res.set({
          'Content-Type': 'image/jpeg',
          // The bytes behind an id never change, so the browser may keep them.
          'Cache-Control': 'private, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        });
        pipeline(stream, res, () => {});
      });
      return undefined;
    };
  }

  router.get('/:id/image', sendFile('image'));
  router.get('/:id/thumb', sendFile('thumb'));

  // Sends the 404 or 403 and returns null unless the caller uploaded this photo.
  function findOwnPhoto(req, res) {
    const row = findPhoto(req.params.id);
    if (!row) {
      res.status(404).json({ error: 'Photo not found' });
      return null;
    }
    if (row.created_by !== req.session.userId) {
      res.status(403).json({ error: 'You can only change photos you added' });
      return null;
    }
    return row;
  }

  router.put('/:id', (req, res) => {
    const row = findOwnPhoto(req, res);
    if (!row) return;
    const details = readDetails(req, res);
    if (!details.ok) return;
    db.prepare('UPDATE photos SET taken_on = ?, caption = ? WHERE id = ?').run(
      details.taken_on,
      details.caption,
      row.id
    );
    res.json(publicPhoto(row.id));
  });

  router.delete('/:id', (req, res) => {
    const row = findOwnPhoto(req, res);
    if (!row) return;
    // Row first: a leftover file is harmless, a row without its file is not.
    db.prepare('DELETE FROM photos WHERE id = ?').run(row.id);
    // The photo is gone as far as anyone can tell once the row is. A file
    // that will not delete is logged, not reported as a failed delete.
    for (const file of Object.values(filePaths(row))) {
      try {
        fs.rmSync(file, { force: true });
      } catch (err) {
        console.error(`Could not remove photo file ${file}:`, err.message);
      }
    }
    res.json({ ok: true });
  });

  return router;
}

// Turns body-parser failures on the photo routes into the photo error messages.
// eslint-disable-next-line no-unused-vars
function photosBodyError(err, req, res, next) {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Photo is too large' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Photo must be a JPEG image' });
  }
  return next(err);
}

module.exports = { createPhotosRouter, photosBodyError };
