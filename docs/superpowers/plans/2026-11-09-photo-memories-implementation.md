# Photo Memories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Photos tab where both users upload shrunken photos, browse them by month, and view, edit or delete their own.

**Architecture:** The browser resizes each photo to two JPEGs on a canvas and posts them as base64 JSON. An Express router at `/api/photos` validates them, writes them to a photos directory beside the database, and serves them only to logged-in users. The client adds one page, an uploader component and a viewer component, with pure helpers in a logic file.

**Tech Stack:** Node, Express 4, better-sqlite3, React 18, Vite, Vitest, supertest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-09-photo-memories-design.md`

## Global Constraints

- No new npm dependencies and no changes to `docker-compose.yml` or `Dockerfile`.
- Photo: longest side at most 2000px, JPEG quality 0.85. Thumbnail: longest side at most 480px, JPEG quality 0.75. Never enlarge.
- Server limits: decoded image at most 5 MB (5 * 1024 * 1024 bytes), decoded thumb at most 300 KB (300 * 1024 bytes), JSON body limit `8mb` on `/api/photos` only, caption at most 200 characters, at most 20 photos per client batch.
- Exact error messages: "Photo must be a JPEG image", "Photo is too large", "A valid date is required", "Caption must be 200 characters or fewer", "Photo not found", "You can only change photos you added".
- `file_key` is generated on the server with `crypto.randomBytes(16).toString('hex')` and never appears in any response.
- The photos directory is never served statically. Image responses carry `Cache-Control: private, max-age=31536000, immutable` and `X-Content-Type-Options: nosniff`.
- Schema changes use `CREATE TABLE IF NOT EXISTS` only.
- Client styling uses the existing CSS custom properties and shared classes in `client/src/index.css`. No horizontal scroll at 375px.
- On this Windows machine the folder name contains `&`, which breaks `npm run` and `npx`. Run tools through node directly:
  - Server tests: from `server/`, `node node_modules/vitest/vitest.mjs run`
  - Client tests: from `client/`, `node node_modules/vitest/vitest.mjs run`
  - Client build: from `client/`, `node node_modules/vite/bin/vite.js build`
- Commit messages follow the repo style (`feat: ...`, `fix(scope): ...`).

## Review Focus

Conditions the spec does not spell out but a user or attacker will hit. Each has a test or check in the task named.

1. Base64 that Node would decode leniently (a `data:image/jpeg;base64,` prefix, embedded whitespace, stray characters) is rejected with 400 rather than stored as a corrupt file. (Task 1)
2. An id such as `..%2F..%2Fapp.db` or `1abc` on the image routes returns 404 and never reads a file outside the photos directory. (Task 2)
3. Choosing the same file twice in a row still opens it the second time: the file input is cleared after each selection. (Task 5)
4. Editing a photo's date so it moves to another month keeps the viewer on that same photo: the open photo is tracked by id, not by position. (Task 6)
5. A photo deleted by the other person while it is on screen (thumbnail or viewer image fails to load) triggers a timeline reload instead of leaving a broken image. (Task 6)

---

### Task 1: Photos table, upload and list

**Files:**
- Modify: `server/schema.sql` (append the `photos` table from the spec)
- Create: `server/routes/photos.js`
- Create: `server/photoValidation.js`
- Modify: `server/app.js`
- Modify: `server/index.js`
- Test: `server/__tests__/photos.test.js`, `server/__tests__/photoValidation.test.js`

**Interfaces:**
- Produces, from `server/photoValidation.js`:
  - `decodeJpeg(value: unknown, maxBytes: number): { buffer: Buffer } | { problem: 'invalid' | 'too_large' }`
  - `isValidTakenOn(value: unknown, now?: Date): boolean`
  - `cleanCaption(value: unknown): { value: string | null } | { problem: 'invalid' | 'too_long' }`
- Produces: `createPhotosRouter(db, photosDir)` from `server/routes/photos.js`.
- Produces: `createApp(db, { photosDir })`. When `photosDir` is absent the photos routes are not mounted, so existing tests that call `createApp(db)` are unaffected.
- Produces: photo JSON shape `{ id, taken_on, caption, created_by, created_at, display_name }`.
- Produces: files `<photosDir>/<file_key>.jpg` and `<photosDir>/<file_key>.thumb.jpg`.

- [ ] **Step 1: Write failing unit tests in `server/__tests__/photoValidation.test.js`**

```js
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('body')]);
const b64 = JPEG.toString('base64');

describe('decodeJpeg', () => {
  it('decodes valid base64 JPEG data', () => {
    expect(decodeJpeg(b64, 1024).buffer.equals(JPEG)).toBe(true);
  });
  it.each([
    [undefined], [null], [42], [''], [{}],
    [`data:image/jpeg;base64,${b64}`],
    [`${b64.slice(0, 4)} ${b64.slice(4)}`],
    [`${b64.slice(0, 4)}\n${b64.slice(4)}`],
    [`${b64}!`],
    [Buffer.from('GIF89a not a jpeg').toString('base64')],
    [Buffer.from([0xff, 0xd8]).toString('base64')],
  ])('rejects %j as invalid', (value) => {
    expect(decodeJpeg(value, 1024)).toEqual({ problem: 'invalid' });
  });
  it('rejects data over the byte limit', () => {
    expect(decodeJpeg(b64, JPEG.length - 1)).toEqual({ problem: 'too_large' });
    expect(decodeJpeg(b64, JPEG.length).buffer).toBeDefined();
  });
});

describe('isValidTakenOn', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  it.each(['2026-11-10', '2026-11-11', '2020-02-29', '1999-01-01'])('accepts %s', (d) => {
    expect(isValidTakenOn(d, now)).toBe(true);
  });
  it.each([
    ['2026-11-12'], ['2999-01-01'], ['2026-02-30'], ['2026-13-01'], ['2026-00-10'],
    ['2026-1-5'], ['11/10/2026'], [''], [null], [undefined], [20261110],
  ])('rejects %j', (d) => {
    expect(isValidTakenOn(d, now)).toBe(false);
  });
});

describe('cleanCaption', () => {
  it.each([[undefined, null], [null, null], ['', null], ['   ', null], [' Beach ', 'Beach']])(
    '%j → %j', (input, value) => { expect(cleanCaption(input)).toEqual({ value }); });
  it('accepts 200 characters and rejects 201', () => {
    expect(cleanCaption('a'.repeat(200))).toEqual({ value: 'a'.repeat(200) });
    expect(cleanCaption('a'.repeat(201))).toEqual({ problem: 'too_long' });
  });
  it.each([[42], [{}], [[]], [true]])('rejects non-string %j', (input) => {
    expect(cleanCaption(input)).toEqual({ problem: 'invalid' });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run from `server/`: `node node_modules/vitest/vitest.mjs run __tests__/photoValidation.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `server/photoValidation.js`**

- `decodeJpeg`: require a non-empty string matching `/^[A-Za-z0-9+/]+={0,2}$/` with length divisible by 4; decode; require the first three bytes `FF D8 FF`; then check `maxBytes`. Check the byte limit before decoding too, using `value.length * 3 / 4 > maxBytes + 2`, so an oversized string is not decoded just to be rejected.
- `isValidTakenOn`: `/^\d{4}-\d{2}-\d{2}$/`, round-trip through `Date.UTC` to reject impossible dates, and compare the string against tomorrow's UTC date (`now` plus 24 hours, ISO date part).

- [ ] **Step 4: Run and confirm pass**

Run: `node node_modules/vitest/vitest.mjs run __tests__/photoValidation.test.js`
Expected: PASS.

- [ ] **Step 5: Write failing route tests in `server/__tests__/photos.test.js`**

Setup: copy `setupTestDb` and `loginAgent` from `server/__tests__/lists.test.js`. In `beforeEach`, `photosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-photos-'))` and `app = createApp(db, { photosDir })`; in `afterEach`, `fs.rmSync(photosDir, { recursive: true, force: true })`. Helpers: `JPEG` and `THUMB` buffers that start with `FF D8 FF` and differ from each other; `body(overrides)` returning `{ image, thumb, taken_on: '2026-11-01', caption: 'Beach', ...overrides }`.

```js
it('stores both files and returns the photo without its file key', async () => {
  const res = await ryan.post('/api/photos').send(body());
  expect(res.status).toBe(201);
  expect(res.body).toMatchObject({ taken_on: '2026-11-01', caption: 'Beach', display_name: 'Ryan' });
  expect(res.body).not.toHaveProperty('file_key');
  const files = fs.readdirSync(photosDir).sort();
  expect(files).toHaveLength(2);
  expect(files[0]).toMatch(/^[0-9a-f]{32}\.jpg$/);
  expect(files[1]).toMatch(/^[0-9a-f]{32}\.thumb\.jpg$/);
  expect(fs.readFileSync(path.join(photosDir, files[0])).equals(JPEG)).toBe(true);
  expect(fs.readFileSync(path.join(photosDir, files[1])).equals(THUMB)).toBe(true);
});

it('lists photos by date descending, then newest upload first, for both users', ...);
// upload taken_on 2026-10-05, 2026-11-01, 2026-11-01 → sam's GET returns ids [third, second, first]; no file_key in any

it('stores an empty caption as null', ...);            // caption '  ' and caption omitted → caption null

it.each([
  [{ image: 'not base64!' }, 400, 'Photo must be a JPEG image'],
  [{ thumb: undefined }, 400, 'Photo must be a JPEG image'],
  [{ image: `data:image/jpeg;base64,${JPEG.toString('base64')}` }, 400, 'Photo must be a JPEG image'],
  [{ image: Buffer.from('GIF89a').toString('base64') }, 400, 'Photo must be a JPEG image'],
  [{ taken_on: '2026-02-30' }, 400, 'A valid date is required'],
  [{ taken_on: '2999-01-01' }, 400, 'A valid date is required'],
  [{ taken_on: undefined }, 400, 'A valid date is required'],
  [{ caption: 'a'.repeat(201) }, 400, 'Caption must be 200 characters or fewer'],
  [{ caption: 42 }, 400, 'Caption must be 200 characters or fewer'],
])('rejects upload %j', async (overrides, status, error) => {
  const res = await ryan.post('/api/photos').send(body(overrides));
  expect(res.status).toBe(status);
  expect(res.body.error).toBe(error);
  expect(fs.readdirSync(photosDir)).toEqual([]);
});

it('rejects an image over 5 MB and a thumb over 300 KB with 413', ...);
// image: JPEG signature + 5 MB of zeros → 413 'Photo is too large'; same for a 301 KB thumb; directory stays empty

it('rejects a body over the 8 MB limit with 413', ...);
// image: 'A'.repeat(9 * 1024 * 1024) → 413 'Photo is too large'

it('leaves no files behind when the database insert fails', async () => {
  db.exec('DROP TABLE photos');
  const res = await ryan.post('/api/photos').send(body());
  expect(res.status).toBe(500);
  expect(fs.readdirSync(photosDir)).toEqual([]);
});

it('answers 401, not 413, to a logged-out client sending a large body', async () => {
  const res = await request(app).post('/api/photos').send({ image: 'A'.repeat(200 * 1024) });
  expect(res.status).toBe(401);
});

it('keeps the default body limit on other routes', async () => {
  const res = await ryan.post('/api/notes').send({ message: 'x'.repeat(200 * 1024) });
  expect(res.status).toBeGreaterThanOrEqual(400);
  expect((await ryan.get('/api/notes')).body).toEqual([]);
});

it('rejects unauthenticated list requests', ...);      // GET /api/photos → 401
```

- [ ] **Step 6: Run and confirm failure**

Run: `node node_modules/vitest/vitest.mjs run __tests__/photos.test.js`
Expected: FAIL, routes return 404.

- [ ] **Step 7: Implement the router, app wiring and startup**

`server/app.js`, in this order: session middleware first; then, only when `options.photosDir` is set,
`app.use('/api/photos', requireAuth, express.json({ limit: '8mb' }), createPhotosRouter(db, options.photosDir), photosBodyError)`; then the existing `app.use(express.json())` and all existing routes unchanged. `photosBodyError` is a four-argument middleware that answers 413 `{ error: 'Photo is too large' }` when `err.type === 'entity.too.large'`, 400 `{ error: 'Photo must be a JPEG image' }` when `err.type === 'entity.parse.failed'`, and otherwise calls `next(err)`.

`server/routes/photos.js`: `createPhotosRouter` calls `fs.mkdirSync(photosDir, { recursive: true })` once, then defines `GET /` and `POST /` for this task. `POST /` validates in the order image, thumb, taken_on, caption; writes both files; inserts; on an insert error removes both files and rethrows so the app's error handler answers 500. All selects go through one `PHOTO_SELECT` that names its columns explicitly (no `photos.*`) so `file_key` cannot leak.

`server/index.js`: `const photosDir = process.env.PHOTOS_DIR || path.join(path.dirname(DB_PATH), 'photos')`, imported `DB_PATH` from `./db`, passed to `createApp`.

- [ ] **Step 8: Run the whole server suite**

Run from `server/`: `node node_modules/vitest/vitest.mjs run`
Expected: all files pass, including every pre-existing test (the middleware reorder must not change them).

- [ ] **Step 9: Commit**

```bash
git add server/schema.sql server/routes/photos.js server/photoValidation.js server/app.js server/index.js server/__tests__/photos.test.js server/__tests__/photoValidation.test.js
git commit -m "feat: add photos table with upload and list routes"
```

---

### Task 2: Serve, edit and delete photos

**Files:**
- Modify: `server/routes/photos.js`
- Test: `server/__tests__/photos.test.js` (new `describe('photo files, edit and delete')`)

**Interfaces:**
- Consumes: `PHOTO_SELECT`, `isValidTakenOn`, `cleanCaption` and the file naming from Task 1.
- Produces: `GET /api/photos/:id/image`, `GET /api/photos/:id/thumb`, `PUT /api/photos/:id`, `DELETE /api/photos/:id` as in the spec's API table.

- [ ] **Step 1: Write failing tests**

Each test uploads one photo as `ryan` in `beforeEach` and keeps its `id`.

```js
it('serves the exact image and thumbnail bytes with private caching', async () => {
  const image = await sam.get(`/api/photos/${id}/image`).buffer(true).parse(binaryParser);
  expect(image.status).toBe(200);
  expect(image.headers['content-type']).toBe('image/jpeg');
  expect(image.headers['cache-control']).toBe('private, max-age=31536000, immutable');
  expect(image.headers['x-content-type-options']).toBe('nosniff');
  expect(image.body.equals(JPEG)).toBe(true);
  const thumb = await sam.get(`/api/photos/${id}/thumb`).buffer(true).parse(binaryParser);
  expect(thumb.body.equals(THUMB)).toBe(true);
});
// binaryParser: collect chunks into a Buffer (supertest custom parser).

it('refuses image requests from a logged-out client', ...);   // both routes → 401

it.each(['999', 'abc', '1abc', '..%2F..%2Fapp.db', '%2e%2e'])(
  'returns 404 for photo id %s on every route', async (bad) => {
    for (const res of [
      await ryan.get(`/api/photos/${bad}/image`),
      await ryan.get(`/api/photos/${bad}/thumb`),
      await ryan.put(`/api/photos/${bad}`).send({ taken_on: '2026-11-01' }),
      await ryan.delete(`/api/photos/${bad}`),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Photo not found');
    }
  });

it('returns 404 when the row exists but its file is gone', ...);
// delete the .jpg from photosDir by hand → GET image 404 'Photo not found'; thumb still 200

it('lets the uploader change the date and caption', ...);
// PUT { taken_on: '2026-10-31', caption: ' Halloween ' } → 200, taken_on '2026-10-31', caption 'Halloween', display_name 'Ryan'
it('clears the caption when it is sent empty', ...);          // caption '' → null
it.each([[{ taken_on: '2026-02-30' }, 'A valid date is required'],
         [{ taken_on: '2026-11-01', caption: 'a'.repeat(201) }, 'Caption must be 200 characters or fewer']])(
  'rejects edit %j', ...);                                     // 400, row unchanged

it('stops the other user editing or deleting', async () => {
  const put = await sam.put(`/api/photos/${id}`).send({ taken_on: '2026-10-31' });
  expect(put.status).toBe(403);
  expect(put.body.error).toBe('You can only change photos you added');
  const del = await sam.delete(`/api/photos/${id}`);
  expect(del.status).toBe(403);
  expect(fs.readdirSync(photosDir)).toHaveLength(2);
  expect((await ryan.get('/api/photos')).body[0].taken_on).toBe('2026-11-01');
});

it('deletes the row and both files', ...);     // { ok: true }; list empty; photosDir empty
it('deletes the row even if a file is already missing', ...);  // remove thumb by hand first → 200, list empty, photosDir empty
```

- [ ] **Step 2: Run and confirm failure**

Run: `node node_modules/vitest/vitest.mjs run __tests__/photos.test.js`
Expected: the new tests FAIL; Task 1 tests pass.

- [ ] **Step 3: Implement the four routes**

- A `findPhoto(id)` helper returns the full row including `file_key`, and returns `undefined` unless `id` matches `/^\d+$/`. Every route in this task starts with it.
- File paths are built only as `path.join(photosDir, `${row.file_key}.jpg`)` or `.thumb.jpg`. Nothing from the request reaches `path.join`.
- Image routes check the file exists, set the two headers and `Content-Type: image/jpeg`, and stream it with `fs.createReadStream`.
- `PUT` requires a valid `taken_on` and applies `cleanCaption`; ownership is checked before validation so the other user always gets 403.
- `DELETE` removes the row, then both files with `fs.rmSync(file, { force: true })`.

- [ ] **Step 4: Run the whole server suite**

Run from `server/`: `node node_modules/vitest/vitest.mjs run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/routes/photos.js server/__tests__/photos.test.js
git commit -m "feat: serve, edit and delete photos"
```

---

### Task 3: Back up photos

**Files:**
- Modify: `scripts/backup.sh`

**Interfaces:**
- Produces: after a run, every file in `data/photos` also exists in `data/backups/photos`.

- [ ] **Step 1: Add the photo step after the database backup and before the `find ... -delete` line**

```sh
# Copy photos that are not in the backup yet. Nothing is ever removed from
# the backup copy, so a photo deleted on the site can still be recovered.
if [ -d "$DATA_DIR/photos" ]; then
  mkdir -p "$BACKUP_DIR/photos"
  cp -Rn "$DATA_DIR/photos/." "$BACKUP_DIR/photos/"
fi
```

- [ ] **Step 2: Verify in a scratch folder**

Copy `scripts/backup.sh` to `<scratch>/proj/scripts/`, create `<scratch>/proj/data/`, and put a stub `sqlite3` script on `PATH` that exits 0 (the real tool may be absent on this machine; the database step is not what is being tested). Then:
- Run with no `data/photos` folder. Expected: exit 0, no `backups/photos` folder.
- Create `data/photos/a.jpg` and `a.thumb.jpg`, run. Expected: both in `backups/photos`.
- Change the content of `backups/photos/a.jpg`, delete `data/photos/a.thumb.jpg`, add `data/photos/b.jpg`, run. Expected: `backups/photos/a.jpg` keeps its changed content, `a.thumb.jpg` is still there, `b.jpg` is added.

- [ ] **Step 3: Commit**

```bash
git add scripts/backup.sh
git commit -m "feat: include photos in the nightly backup"
```

---

### Task 4: Client helpers, API methods and image resizing

**Files:**
- Create: `client/src/pages/photosLogic.js`
- Create: `client/src/pages/imageResize.js`
- Modify: `client/src/api.js`
- Test: `client/src/__tests__/photosLogic.test.js`

**Interfaces:**
- Produces, from `photosLogic.js`:
  - `groupByMonth(photos): { key: string, label: string, photos: Photo[] }[]`
  - `scaledSize(width: number, height: number, maxSide: number): { width: number, height: number }`
  - `defaultTakenOn(lastModifiedMs: number, now?: Date): string`
  - `isUsableDate(dateKey: string, now?: Date): boolean`
  - `MAX_BATCH = 20`, `PHOTO_MAX_SIDE = 2000`, `THUMB_MAX_SIDE = 480`, `PHOTO_QUALITY = 0.85`, `THUMB_QUALITY = 0.75`
- Produces, from `imageResize.js`: `async resizeToJpeg(file: File, maxSide: number, quality: number): Promise<string>` resolving to base64 with no `data:` prefix, rejecting with an `Error` if the file cannot be decoded.
- Produces, on `api`: `getPhotos()`, `uploadPhoto({ image, thumb, taken_on, caption })`, `updatePhoto(id, { taken_on, caption })`, `deletePhoto(id)`.
- Produces, as named exports of `api.js`: `photoUrl(id)` → `/api/photos/<id>/image`, `thumbUrl(id)` → `/api/photos/<id>/thumb`.

- [ ] **Step 1: Write failing tests in `client/src/__tests__/photosLogic.test.js`**

```js
describe('groupByMonth', () => {
  it('groups consecutive photos by month and keeps their order', () => {
    const groups = groupByMonth([
      { id: 5, taken_on: '2026-11-14' }, { id: 4, taken_on: '2026-11-01' },
      { id: 3, taken_on: '2026-10-31' }, { id: 1, taken_on: '2025-12-25' },
    ]);
    expect(groups.map((g) => [g.key, g.label, g.photos.map((p) => p.id)])).toEqual([
      ['2026-11', 'November 2026', [5, 4]],
      ['2026-10', 'October 2026', [3]],
      ['2025-12', 'December 2025', [1]],
    ]);
  });
  it('returns an empty array for no photos', () => { expect(groupByMonth([])).toEqual([]); });
});

describe('scaledSize', () => {
  it.each([
    [4000, 3000, 2000, 2000, 1500],
    [3000, 4000, 2000, 1500, 2000],
    [1200, 800, 2000, 1200, 800],
    [2000, 2000, 2000, 2000, 2000],
    [4032, 3024, 480, 480, 360],
    [10000, 100, 2000, 2000, 20],
    [5000, 1, 2000, 2000, 1],
  ])('%i×%i within %i → %i×%i', (w, h, max, ow, oh) => {
    expect(scaledSize(w, h, max)).toEqual({ width: ow, height: oh });
  });
});

describe('defaultTakenOn', () => {
  const now = new Date(2026, 10, 10, 15, 0, 0);            // local time
  it('uses the file date in local time', () => {
    expect(defaultTakenOn(new Date(2026, 9, 31, 23, 30).getTime(), now)).toBe('2026-10-31');
  });
  it('caps a future file date at today', () => {
    expect(defaultTakenOn(new Date(2027, 0, 1).getTime(), now)).toBe('2026-11-10');
  });
  it.each([[NaN], [undefined], [0]])('falls back to today for %j', (ms) => {
    expect(defaultTakenOn(ms, now)).toBe('2026-11-10');
  });
});

describe('isUsableDate', () => {
  const now = new Date(2026, 10, 10, 15, 0, 0);
  it.each(['2026-11-10', '2020-02-29'])('accepts %s', (d) => { expect(isUsableDate(d, now)).toBe(true); });
  it.each(['2026-11-11', '2026-02-30', '', 'abc', '2026-1-1'])('rejects %j', (d) => {
    expect(isUsableDate(d, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run from `client/`: `node node_modules/vitest/vitest.mjs run src/__tests__/photosLogic.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `photosLogic.js`, `imageResize.js` and the `api.js` additions**

- `groupByMonth` builds labels from a fixed array of month names, not `toLocaleDateString`, so the output does not depend on the machine's locale.
- `scaledSize` rounds each side and never returns less than 1.
- `defaultTakenOn` reuses `toDateKey` from `client/src/components/monthGridLogic.js`.
- `resizeToJpeg`: load the file into an `Image` through `URL.createObjectURL`, always revoking the URL; reject with `new Error("Couldn't read " + file.name)` on a load error or a zero-sized image; size the canvas with `scaledSize`; fill it white before drawing; export with `canvas.toBlob(cb, 'image/jpeg', quality)`; convert the blob to base64 with `FileReader.readAsDataURL` and strip everything up to and including the first comma. Reject if `toBlob` yields null.

- [ ] **Step 4: Run the whole client suite**

Run from `client/`: `node node_modules/vitest/vitest.mjs run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/photosLogic.js client/src/pages/imageResize.js client/src/api.js client/src/__tests__/photosLogic.test.js
git commit -m "feat: add client helpers, API methods and image resizing for photos"
```

---

### Task 5: Photos page with timeline and uploader

**Files:**
- Create: `client/src/pages/Photos.jsx` (exports `PhotosPage`)
- Create: `client/src/components/PhotoUploader.jsx` (exports `PhotoUploader`)
- Modify: `client/src/components/Icons.jsx` (add `PhotoIcon`, `PlusIcon`, `CloseIcon`)
- Modify: `client/src/App.jsx` (add `{ id: 'photos', label: 'Photos', Icon: PhotoIcon }` after `lists`; render `<PhotosPage currentUserId={user.id} />`)
- Modify: `client/src/index.css` (new "Photos" section before "Games (shared)"; phone and mid-width tab adjustments if six tabs need them)

**Interfaces:**
- Consumes: everything Task 4 produces; `useRefreshOnVisible`, `CuteCat`, shared CSS classes.
- Produces: `<PhotosPage currentUserId={number} />`; `<PhotoUploader files={File[]} onUploaded={() => void} onDone={() => void} />`, where `onUploaded` fires after each successful upload and `onDone` when the staging list becomes empty or is cancelled.
- Produces: `PhotosPage` state `openPhotoId: number | null`, set when a thumbnail is clicked. Task 6 renders the viewer from it.

- [ ] **Step 1: Build `PhotosPage`**

- Heading "Photos", subtitle "Our memories, month by month.", and an "Add photos" button (`PlusIcon`) that clicks a hidden `<input type="file" accept="image/*" multiple>`.
- On change: take the first `MAX_BATCH` files; if more were chosen, show the notice "Only the first 20 photos were added." in a `.banner`; pass them to `PhotoUploader`; then set the input's `value` to `''` so choosing the same file again fires `change`.
- Timeline from `groupByMonth(photos)`: an `h2` per month and a grid of `<button>` thumbnails, each containing `<img src={thumbUrl(id)} loading="lazy" alt={caption || 'Photo from ' + taken_on}>`. Clicking sets `openPhotoId`.
- A thumbnail `onError` triggers one timeline reload (a ref guards against a reload loop: at most one reload per failed id).
- Empty state when loaded with no photos and nothing staged: cat mascot, "No photos yet", "Add your first one to start the timeline."
- A failed load shows the error and no empty state.
- Reloads through `useRefreshOnVisible` only when nothing is staged and `openPhotoId` is null.

- [ ] **Step 2: Build `PhotoUploader`**

- Each staged entry: `{ key, file, previewUrl, taken_on, caption, error }`. `previewUrl` comes from `URL.createObjectURL(file)` and is revoked when the entry is removed and when the component unmounts.
- `taken_on` starts as `defaultTakenOn(file.lastModified)`. The date input has `max` set to today's local date.
- Row: preview image, date input, caption input (`maxLength={200}`, placeholder "Add a caption (optional)"), remove button labelled `Remove <file name>`.
- Buttons: `Upload 1 photo` / `Upload N photos`, and "Cancel". While uploading, the upload button reads `Uploading 2 of 3` and both buttons and all fields are disabled.
- Upload loop, one entry at a time: skip with the entry error "Choose a date that isn't in the future." if `!isUsableDate(taken_on)`; otherwise `resizeToJpeg` twice (photo then thumb), `api.uploadPhoto`, remove the entry, call `onUploaded()`. On any error, set that entry's `error` to the message and continue with the next entry.
- A ref guards the loop so a second tap on Upload while it runs does nothing.
- When the list becomes empty, call `onDone()`.

- [ ] **Step 3: Add styles**

Classes: `.photos-page` (max-width 920px, centered), `.photos-heading` (title left, button right, wraps), `.photo-month`, `.photo-grid` (`grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))`, gap 6px; exactly three columns at or below 760px), `.photo-thumb` (square via `aspect-ratio: 1`, `object-fit: cover`, rounded, focus ring), `.photo-staging` (card), `.photo-staged` (row; stacks its fields under the preview at phone width), `.photo-staged-preview` (72px square).
If six tabs do not fit, reduce `.tab` padding and font size inside the existing phone media query, and add a rule for widths between 761px and 900px that tightens the top-bar tabs. Do not hide labels.

- [ ] **Step 4: Run tests and build**

Run from `client/`: `node node_modules/vitest/vitest.mjs run` then `node node_modules/vite/bin/vite.js build`
Expected: all tests pass; build completes with no errors.

- [ ] **Step 5: Check in the browser**

Start the server against a throwaway database and photos folder with two test users (launcher script outside the repo setting `DB_PATH`, `PHOTOS_DIR`, `PORT`, `USER1_*`, `USER2_*`). Generate test images in the page with a canvas (a wide one, a tall one, and a PNG with a transparent region) and feed them to the file input through a `DataTransfer`. Confirm:
- At 375px, 768px and 1280px the six tabs fit with no overlap or clipping, and `document.documentElement.scrollWidth === clientWidth`.
- Staging shows a preview, today's date and an empty caption for each file; removing one works; Cancel clears the panel.
- Uploading three photos shows progress, empties the panel and adds three thumbnails under the right month headings. A photo given last month's date appears under last month.
- The stored photo is at most 2000px on its long side and the thumbnail at most 480px (fetch each and read `naturalWidth`/`naturalHeight`); the transparent PNG has a white background.
- Selecting the same file twice in a row stages it both times.
- Selecting 21 files stages 20 and shows the notice.
- With the server stopped, Upload leaves the photos staged with an error; after restarting, Upload succeeds.
- A non-image file renamed to `.jpg` shows "Couldn't read <name>" and stays staged.

- [ ] **Step 6: Commit**

```bash
git add client/src
git commit -m "feat: add Photos page with timeline and uploader"
```

---

### Task 6: Photo viewer with edit and delete

**Files:**
- Create: `client/src/components/PhotoViewer.jsx` (exports `PhotoViewer`)
- Modify: `client/src/pages/Photos.jsx` (render the viewer)
- Modify: `client/src/index.css` (viewer styles in the "Photos" section)

**Interfaces:**
- Consumes: `openPhotoId` and the loaded `photos` array from Task 5; `photoUrl`, `api.updatePhoto`, `api.deletePhoto`, `isUsableDate`.
- Produces: `<PhotoViewer photos={Photo[]} photoId={number} currentUserId={number} onNavigate={(id: number) => void} onClose={() => void} onChanged={() => Promise<void>} />`. `onChanged` reloads the timeline and resolves when it has.

- [ ] **Step 1: Build `PhotoViewer`**

- Renders a fixed full-screen overlay with `role="dialog"`, `aria-modal="true"` and `aria-label="Photo"`.
- The current photo is `photos.find((p) => p.id === photoId)`. If it is not found (deleted elsewhere, or after a reload), call `onClose()`.
- Shows `<img src={photoUrl(id)}>` scaled to fit with `object-fit: contain`, the caption if any, the date formatted like "Saturday, November 14, 2026" (built from the `YYYY-MM-DD` parts in local time, not `new Date(string)`), and "Added by <display_name>".
- Previous and next buttons move to the neighbouring id in `photos` order through `onNavigate`; each is disabled at its end of the list. ArrowLeft and ArrowRight do the same, Escape calls `onClose`. Keys are ignored while an input in the viewer has focus, except Escape, which cancels the edit form first if it is open.
- On open, focus moves to the close button. On close, focus returns to the element that was focused before opening. While open, `document.body.style.overflow = 'hidden'`, restored on unmount.
- Image `onError`: call `onChanged()` so a photo deleted by the other person disappears.
- When `photo.created_by === currentUserId`: an Edit button opens a form with a date input (`max` today) and caption input (`maxLength={200}`), Save and Cancel. Save validates with `isUsableDate`, calls `api.updatePhoto`, awaits `onChanged()`, and closes the form; the viewer stays on the same photo id.
- A Delete button shows an inline confirmation "Delete this photo?" with Delete and Cancel. Confirming works out the id to show next (the next photo, else the previous, else none) before deleting, calls `api.deletePhoto`, awaits `onChanged()`, then navigates to that id or calls `onClose()`. A ref ignores repeat taps while the request is in flight. A 404 from the delete is treated as success.
- Edit and delete errors show inline inside the viewer in the `.error` style.

- [ ] **Step 2: Add viewer styles**

Classes: `.photo-viewer` (fixed, inset 0, z-index above the top bar and bottom tabs, dark translucent backdrop `rgba(45, 28, 36, 0.92)`), `.photo-viewer-image`, `.photo-viewer-close`, `.photo-viewer-nav` (previous and next, at least 44px touch targets), `.photo-viewer-info` (light text on the dark backdrop, captions wrap with `overflow-wrap: anywhere`), `.photo-viewer-form`. At phone width the info sits below the image and the image keeps at least 55% of the viewport height.

- [ ] **Step 3: Run tests and build**

Run from `client/`: `node node_modules/vitest/vitest.mjs run` then `node node_modules/vite/bin/vite.js build`
Expected: all tests pass; build completes.

- [ ] **Step 4: Check in the browser**

With the Task 5 setup and at least four photos across two months, at 375px and 1280px:
- Opening a thumbnail shows that photo, its caption, long date and uploader. Focus is on the close button; the page behind does not scroll.
- Next and previous move in timeline order and disable at the ends; ArrowLeft, ArrowRight and Escape work; after closing, focus is back on the thumbnail.
- As the uploader: edit the caption; then edit the date to move the photo to the other month. The viewer still shows the same photo, and after closing it sits under the new month.
- A future date in the edit form shows an error and saves nothing.
- Delete asks first; confirming shows the neighbouring photo; deleting the last remaining photo closes the viewer and shows the empty state. A fast double-click on the confirm button produces no error.
- As the other user: the same photos open, with no Edit or Delete buttons.
- Delete a photo through the API while it is open in the viewer, then trigger its image to reload (navigate away and back): the viewer closes or moves on, and the thumbnail is gone, with no broken image left.
- After logging out, requesting a photo's image address returns 401.
- A 200-character caption with no spaces wraps inside the viewer at 375px.
- No errors in the browser console apart from expected 401s before login and the deliberate 404 above.

- [ ] **Step 5: Commit**

```bash
git add client/src
git commit -m "feat: add photo viewer with edit and delete"
```
