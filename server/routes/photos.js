const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
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
