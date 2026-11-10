// server/__tests__/photos.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../app');
const { createDb } = require('../db');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('the full photo')]);
const THUMB = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('thumb')]);

function setupTestDb() {
  const db = createDb(':memory:');
  const hash = bcrypt.hashSync('testpass', 4);
  const insert = db.prepare(
    'INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)'
  );
  insert.run('ryan', hash, 'Ryan');
  insert.run('sam', hash, 'Sam');
  return db;
}

async function loginAgent(app, username) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ username, password: 'testpass' });
  return agent;
}

function body(overrides = {}) {
  return {
    image: JPEG.toString('base64'),
    thumb: THUMB.toString('base64'),
    taken_on: '2026-11-01',
    caption: 'Beach',
    ...overrides,
  };
}

function jpegOfSize(bytes) {
  const buffer = Buffer.alloc(bytes);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer.toString('base64');
}

let db;
let app;
let photosDir;
let ryan;
let sam;

beforeEach(async () => {
  db = setupTestDb();
  photosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-photos-'));
  app = createApp(db, { photosDir });
  ryan = await loginAgent(app, 'ryan');
  sam = await loginAgent(app, 'sam');
});

afterEach(() => {
  fs.rmSync(photosDir, { recursive: true, force: true });
});

describe('photo upload and list', () => {
  it('stores both files and returns the photo without its file key', async () => {
    const res = await ryan.post('/api/photos').send(body());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      taken_on: '2026-11-01',
      caption: 'Beach',
      display_name: 'Ryan',
    });
    expect(res.body).not.toHaveProperty('file_key');

    const files = fs.readdirSync(photosDir).sort();
    expect(files).toHaveLength(2);
    expect(files[0]).toMatch(/^[0-9a-f]{32}\.jpg$/);
    expect(files[1]).toMatch(/^[0-9a-f]{32}\.thumb\.jpg$/);
    expect(fs.readFileSync(path.join(photosDir, files[0])).equals(JPEG)).toBe(true);
    expect(fs.readFileSync(path.join(photosDir, files[1])).equals(THUMB)).toBe(true);
  });

  it('lists photos by date descending, then newest upload first, for both users', async () => {
    const first = await ryan.post('/api/photos').send(body({ taken_on: '2026-10-05' }));
    const second = await ryan.post('/api/photos').send(body({ taken_on: '2026-11-01' }));
    const third = await sam.post('/api/photos').send(body({ taken_on: '2026-11-01' }));

    const res = await sam.get('/api/photos');
    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.id)).toEqual([third.body.id, second.body.id, first.body.id]);
    expect(res.body.map((p) => p.display_name)).toEqual(['Sam', 'Ryan', 'Ryan']);
    for (const photo of res.body) {
      expect(photo).not.toHaveProperty('file_key');
    }
  });

  it('stores an empty or missing caption as null', async () => {
    const blank = await ryan.post('/api/photos').send(body({ caption: '  ' }));
    expect(blank.body.caption).toBeNull();
    const missing = await ryan.post('/api/photos').send(body({ caption: undefined }));
    expect(missing.status).toBe(201);
    expect(missing.body.caption).toBeNull();
  });

  it.each([
    [{ image: 'not base64!' }, 'Photo must be a JPEG image'],
    [{ thumb: undefined }, 'Photo must be a JPEG image'],
    [{ image: `data:image/jpeg;base64,${JPEG.toString('base64')}` }, 'Photo must be a JPEG image'],
    [{ image: Buffer.from('GIF89a').toString('base64') }, 'Photo must be a JPEG image'],
    [{ thumb: Buffer.from('GIF89a').toString('base64') }, 'Photo must be a JPEG image'],
    [{ taken_on: '2026-02-30' }, 'A valid date is required'],
    [{ taken_on: '2999-01-01' }, 'A valid date is required'],
    [{ taken_on: undefined }, 'A valid date is required'],
    [{ caption: 'a'.repeat(201) }, 'Caption must be 200 characters or fewer'],
    [{ caption: 42 }, 'Caption must be 200 characters or fewer'],
  ])('rejects upload %j', async (overrides, error) => {
    const res = await ryan.post('/api/photos').send(body(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
    expect(fs.readdirSync(photosDir)).toEqual([]);
    expect((await ryan.get('/api/photos')).body).toEqual([]);
  });

  it('rejects an image over 5 MB and a thumb over 300 KB with 413', async () => {
    const bigImage = await ryan
      .post('/api/photos')
      .send(body({ image: jpegOfSize(5 * 1024 * 1024 + 1) }));
    expect(bigImage.status).toBe(413);
    expect(bigImage.body.error).toBe('Photo is too large');

    const bigThumb = await ryan
      .post('/api/photos')
      .send(body({ thumb: jpegOfSize(300 * 1024 + 1) }));
    expect(bigThumb.status).toBe(413);
    expect(bigThumb.body.error).toBe('Photo is too large');

    expect(fs.readdirSync(photosDir)).toEqual([]);
  });

  it('accepts an image of exactly 5 MB', async () => {
    const res = await ryan.post('/api/photos').send(body({ image: jpegOfSize(5 * 1024 * 1024) }));
    expect(res.status).toBe(201);
  });

  it('rejects a body over the 8 MB limit with 413', async () => {
    const res = await ryan
      .post('/api/photos')
      .send(body({ image: 'A'.repeat(9 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error).toBe('Photo is too large');
  });

  it('leaves no files behind when the database insert fails', async () => {
    db.exec('DROP TABLE photos');
    const res = await ryan.post('/api/photos').send(body());
    expect(res.status).toBe(500);
    expect(fs.readdirSync(photosDir)).toEqual([]);
  });

  it('checks the login before reading the body', async () => {
    // Broken JSON makes the order visible: a parser that ran first would
    // answer 400 for the body before the login check could answer 401.
    const res = await request(app)
      .post('/api/photos')
      .set('Content-Type', 'application/json')
      .send('{"image": "AAAA');
    expect(res.status).toBe(401);
  });

  it('answers a logged-in client sending broken JSON with 400', async () => {
    const res = await ryan
      .post('/api/photos')
      .set('Content-Type', 'application/json')
      .send('{"image": "AAAA');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Photo must be a JPEG image');
  });

  it('keeps the default body limit on other routes', async () => {
    const res = await ryan.post('/api/notes').send({ message: 'x'.repeat(200 * 1024) });
    // 500 is the app's long-standing answer to any body-parser error on
    // these routes; what matters here is that the note was not accepted.
    expect(res.status).toBe(500);
    expect((await ryan.get('/api/notes')).body).toEqual([]);
  });

  it('rejects unauthenticated list requests', async () => {
    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(401);
  });
});

describe('photo files, edit and delete', () => {
  let id;

  function binaryParser(res, callback) {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  }

  function fileNamed(suffix) {
    const name = fs.readdirSync(photosDir).find((f) => f.endsWith(suffix) && (suffix === '.thumb.jpg' || !f.endsWith('.thumb.jpg')));
    return path.join(photosDir, name);
  }

  beforeEach(async () => {
    const res = await ryan.post('/api/photos').send(body());
    id = res.body.id;
  });

  it('serves the exact image and thumbnail bytes with private caching', async () => {
    const image = await sam.get(`/api/photos/${id}/image`).buffer(true).parse(binaryParser);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(image.headers['cache-control']).toBe('private, max-age=31536000, immutable');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(image.body.equals(JPEG)).toBe(true);

    const thumb = await sam.get(`/api/photos/${id}/thumb`).buffer(true).parse(binaryParser);
    expect(thumb.status).toBe(200);
    expect(thumb.headers['content-type']).toBe('image/jpeg');
    expect(thumb.body.equals(THUMB)).toBe(true);
  });

  it('refuses image requests from a logged-out client', async () => {
    expect((await request(app).get(`/api/photos/${id}/image`)).status).toBe(401);
    expect((await request(app).get(`/api/photos/${id}/thumb`)).status).toBe(401);
  });

  it.each(['999', 'abc', '1abc', '..%2F..%2Fapp.db', '%2e%2e'])(
    'returns 404 for photo id %s on every route',
    async (bad) => {
      const responses = [
        await ryan.get(`/api/photos/${bad}/image`),
        await ryan.get(`/api/photos/${bad}/thumb`),
        await ryan.put(`/api/photos/${bad}`).send({ taken_on: '2026-11-01' }),
        await ryan.delete(`/api/photos/${bad}`),
      ];
      for (const res of responses) {
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Photo not found');
      }
      expect(fs.readdirSync(photosDir)).toHaveLength(2);
    }
  );

  it('returns 404 when the row exists but its file is gone', async () => {
    fs.rmSync(fileNamed('.jpg'));
    const image = await ryan.get(`/api/photos/${id}/image`);
    expect(image.status).toBe(404);
    expect(image.body.error).toBe('Photo not found');
    expect((await ryan.get(`/api/photos/${id}/thumb`)).status).toBe(200);
  });

  it('lets the uploader change the date and caption', async () => {
    const res = await ryan
      .put(`/api/photos/${id}`)
      .send({ taken_on: '2026-10-31', caption: ' Halloween ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      taken_on: '2026-10-31',
      caption: 'Halloween',
      display_name: 'Ryan',
    });
    expect(res.body).not.toHaveProperty('file_key');
    expect((await sam.get('/api/photos')).body[0].caption).toBe('Halloween');
  });

  it('clears the caption when it is sent empty', async () => {
    const res = await ryan.put(`/api/photos/${id}`).send({ taken_on: '2026-11-01', caption: '' });
    expect(res.status).toBe(200);
    expect(res.body.caption).toBeNull();
  });

  it.each([
    [{ taken_on: '2026-02-30' }, 'A valid date is required'],
    [{ caption: 'New' }, 'A valid date is required'],
    [{ taken_on: '2026-11-01', caption: 'a'.repeat(201) }, 'Caption must be 200 characters or fewer'],
  ])('rejects edit %j', async (edit, error) => {
    const res = await ryan.put(`/api/photos/${id}`).send(edit);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
    expect((await ryan.get('/api/photos')).body[0]).toMatchObject({
      taken_on: '2026-11-01',
      caption: 'Beach',
    });
  });

  it('stops the other user editing or deleting', async () => {
    const put = await sam.put(`/api/photos/${id}`).send({ taken_on: '2026-10-31' });
    expect(put.status).toBe(403);
    expect(put.body.error).toBe('You can only change photos you added');

    const del = await sam.delete(`/api/photos/${id}`);
    expect(del.status).toBe(403);
    expect(del.body.error).toBe('You can only change photos you added');

    expect(fs.readdirSync(photosDir)).toHaveLength(2);
    expect((await ryan.get('/api/photos')).body[0].taken_on).toBe('2026-11-01');
  });

  it('answers 403 to the other user even when their edit is invalid', async () => {
    const res = await sam.put(`/api/photos/${id}`).send({ taken_on: 'nonsense' });
    expect(res.status).toBe(403);
  });

  it('deletes the row and both files', async () => {
    const res = await ryan.delete(`/api/photos/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect((await ryan.get('/api/photos')).body).toEqual([]);
    expect(fs.readdirSync(photosDir)).toEqual([]);
  });

  it('answers 404 instead of crashing when the file cannot be read', async () => {
    // A directory where the file should be makes the read fail after it starts.
    const file = fileNamed('.jpg');
    fs.rmSync(file);
    fs.mkdirSync(file);
    const res = await ryan.get(`/api/photos/${id}/image`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Photo not found');
    expect(res.headers['cache-control']).toBeUndefined();
    // The server is still answering.
    expect((await ryan.get(`/api/photos/${id}/thumb`)).status).toBe(200);
  });

  it('reports a delete as done even if a file cannot be removed', async () => {
    const file = fileNamed('.jpg');
    fs.rmSync(file);
    fs.mkdirSync(file);
    fs.writeFileSync(path.join(file, 'inside'), 'x');
    const res = await ryan.delete(`/api/photos/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect((await ryan.get('/api/photos')).body).toEqual([]);
  });

  it('deletes the row even if a file is already missing', async () => {
    fs.rmSync(fileNamed('.thumb.jpg'));
    const res = await ryan.delete(`/api/photos/${id}`);
    expect(res.status).toBe(200);
    expect((await ryan.get('/api/photos')).body).toEqual([]);
    expect(fs.readdirSync(photosDir)).toEqual([]);
  });

  it('rejects unauthenticated edit and delete', async () => {
    expect((await request(app).put(`/api/photos/${id}`).send({})).status).toBe(401);
    expect((await request(app).delete(`/api/photos/${id}`)).status).toBe(401);
  });
});
