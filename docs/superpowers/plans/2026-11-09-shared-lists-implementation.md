# Shared Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Lists tab where both users create named checklists, add items, check them off and clear them.

**Architecture:** Two new SQLite tables and one Express router at `/api/lists`, mirroring `server/routes/notes.js`. One new React page with a detail component, pure helpers in a logic file, and styles built on the existing design tokens. The client reloads from the server after every action and when the tab becomes visible.

**Tech Stack:** Node, Express, better-sqlite3, React 18, Vite, Vitest, supertest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-09-shared-lists-design.md`

## Global Constraints

- No new npm dependencies, environment variables or Docker changes.
- List name: trimmed, 1 to 60 characters. Item text: trimmed, 1 to 200 characters.
- All API errors are JSON `{ error: string }`. Exact messages: "List name is required", "Item text is required", "List not found", "Item not found".
- SQLite foreign keys are not enforced by the connection; delete a list's items explicitly in the same transaction.
- Schema changes use `CREATE TABLE IF NOT EXISTS` only. Existing tables are not altered.
- Client styling uses the CSS custom properties already defined in `client/src/index.css` (`--primary`, `--line`, `--muted`, `.card`, `.btn`, `.icon-btn`, `.field`, `.empty-state`, `.error`). No new colors outside those tokens.
- The page must not scroll horizontally at 375px width.
- On this Windows machine the folder name contains `&`, which breaks `npm run` and `npx`. Run tools through node directly:
  - Server tests: from `server/`, `node node_modules/vitest/vitest.mjs run`
  - Client tests: from `client/`, `node node_modules/vitest/vitest.mjs run`
  - Client build: from `client/`, `node node_modules/vite/bin/vite.js build`
- Commit messages follow the repo style (`feat: ...`, `fix(scope): ...`).

## Review Focus

Conditions the spec does not spell out but a user will hit. Each has a test or check in the task named.

1. A non-string `name` or `text` in the request body (number, null, object) returns 400, not a 500 from calling `.trim()` on it. (Tasks 1 and 2)
2. A non-numeric id in the path, such as `/api/lists/abc`, returns 404, not 500. (Tasks 1 and 2)
3. "Clear checked" on a list with nothing checked succeeds with `removed: 0` and leaves unchecked items alone. (Task 2)
4. A 200-character item with no spaces wraps inside its row on a phone instead of pushing the page sideways. (Task 4)
5. Tapping Add or Create twice quickly creates one entry, not two: the submit button is disabled while its request is in flight. (Task 4)

---

### Task 1: Lists table and list routes

**Files:**
- Modify: `server/schema.sql` (append)
- Create: `server/routes/lists.js`
- Modify: `server/app.js` (mount the router next to the notes router)
- Test: `server/__tests__/lists.test.js`

**Interfaces:**
- Produces: `createListsRouter(db)` exported from `server/routes/lists.js`, mounted as `app.use('/api/lists', requireAuth, createListsRouter(db))`.
- Produces: list JSON shape `{ id, name, created_by, created_at, item_count, checked_count }` from `GET /api/lists`; `{ id, name, created_by, created_at }` from POST and PUT.
- Produces: a helper inside the router file, `findList(id)`, returning the row or `undefined`; Task 2 reuses it.

- [ ] **Step 1: Append both tables to `server/schema.sql`**, copied exactly from the spec's Data model section (`lists` and `list_items`).

- [ ] **Step 2: Write failing tests in `server/__tests__/lists.test.js`**

Copy `setupTestDb` and `loginAgent` from `server/__tests__/notes.test.js` (users `ryan` and `sam`). Tests, under `describe('lists API')`:

```js
it('creates a list and returns it with zero counts in the overview', async () => {
  const res = await agent.post('/api/lists').send({ name: '  Groceries  ' });
  expect(res.status).toBe(201);
  expect(res.body.name).toBe('Groceries');
  const list = await agent.get('/api/lists');
  expect(list.body).toHaveLength(1);
  expect(list.body[0]).toMatchObject({ name: 'Groceries', item_count: 0, checked_count: 0 });
});

it('lists newest first', ...);            // create A then B, expect [B, A] by id
it('lets the other user see and rename a list', ...);   // sam PUT { name: 'Food' } → 200, name 'Food'
it('deletes a list', ...);                // DELETE → { ok: true }, GET /api/lists → []

it.each([
  [{}, 'List name is required'],
  [{ name: '   ' }, 'List name is required'],
  [{ name: 42 }, 'List name is required'],
  [{ name: null }, 'List name is required'],
])('rejects create with body %j', async (body, error) => {
  const res = await agent.post('/api/lists').send(body);
  expect(res.status).toBe(400);
  expect(res.body.error).toBe(error);
});

it('rejects a name over 60 characters on create and rename', ...);  // 'a'.repeat(61) → 400; 'a'.repeat(60) → 201
it('returns 404 for an unknown or non-numeric list id', ...);       // PUT and DELETE on /999 and /abc → 404 'List not found'
it('rejects unauthenticated requests', async () => {
  const res = await request(createApp(setupTestDb())).get('/api/lists');
  expect(res.status).toBe(401);
});
```

- [ ] **Step 3: Run and confirm failure**

Run from `server/`: `node node_modules/vitest/vitest.mjs run __tests__/lists.test.js`
Expected: FAIL, the routes return 404.

- [ ] **Step 4: Implement `server/routes/lists.js` and mount it in `server/app.js`**

Routes in this task: `GET /`, `POST /`, `PUT /:id`, `DELETE /:id`.
- `GET /` computes `item_count` and `checked_count` with a `LEFT JOIN list_items` and `COUNT(list_items.id)` / `COUNT(list_items.checked_at)`, `GROUP BY lists.id`, `ORDER BY lists.id DESC`.
- A shared `cleanText(value, max)` helper returns the trimmed string, or `null` when the value is not a string, is empty after trimming, or exceeds `max`. Too-long names return 400 with "List name must be 60 characters or fewer".
- `DELETE /:id` runs both deletes inside `db.transaction`.

- [ ] **Step 5: Run the whole server suite**

Run from `server/`: `node node_modules/vitest/vitest.mjs run`
Expected: all files pass, including the existing ones.

- [ ] **Step 6: Commit**

```bash
git add server/schema.sql server/routes/lists.js server/app.js server/__tests__/lists.test.js
git commit -m "feat: add shared lists table and list routes"
```

---

### Task 2: List item routes

**Files:**
- Modify: `server/routes/lists.js`
- Test: `server/__tests__/lists.test.js` (new `describe('list items API')`)

**Interfaces:**
- Consumes: `findList(id)` and `cleanText(value, max)` from Task 1.
- Produces: item JSON shape `{ id, list_id, text, created_by, created_at, checked_by, checked_at, checked_by_name }` where the last three are `null` when unchecked.
- Produces: `GET /api/lists/:id` returning `{ id, name, created_by, created_at, items: Item[] }`.

- [ ] **Step 1: Write failing tests**

```js
it('adds items and returns them oldest first', ...);
// POST /items { text: ' Milk ' } → 201, text 'Milk'; add 'Eggs'; GET /:id → items texts ['Milk', 'Eggs']

it('records who checked an item and shows it to the other user', async () => {
  await sam.put(`/api/lists/${listId}/items/${milkId}`).send({ checked: true });
  const res = await ryan.get(`/api/lists/${listId}`);
  const milk = res.body.items.find((i) => i.id === milkId);
  expect(milk.checked_by_name).toBe('Sam');
  expect(milk.checked_at).toBeTruthy();
});

it('keeps the original checker when an item is checked twice', ...);
// sam checks, ryan checks → checked_by_name still 'Sam'

it('unchecks an item and clears both fields', ...);
// { checked: false } → checked_by null, checked_at null

it('orders unchecked items first, then checked by most recent', ...);
// items A, B, C; check A then C → order from GET is [B, C, A].
// Set checked_at directly in the db for A and C to distinct values so the test does not depend on timing.

it('updates overview counts', ...);       // 3 items, 1 checked → item_count 3, checked_count 1
it('deletes one item', ...);
it('clears checked items only', ...);     // POST /clear-checked → { ok: true, removed: 2 }, one unchecked item remains
it('clears nothing when nothing is checked', ...);  // → { ok: true, removed: 0 }, items unchanged
it('removes items when their list is deleted', ...);
// delete the list, then: db.prepare('SELECT COUNT(*) AS n FROM list_items').get().n === 0

it.each([[{}], [{ text: '  ' }], [{ text: 7 }], [{ text: null }]])('rejects item body %j', ...);  // 400 'Item text is required'
it('rejects item text over 200 characters', ...);     // 201 chars → 400; 200 chars → 201
it.each([[{}], [{ checked: 'yes' }], [{ checked: 1 }]])('rejects check body %j', ...);  // 400
it('returns 404 for an item addressed through the wrong list', ...);
// item belongs to list 1; PUT and DELETE via /api/lists/<list2>/items/<item> → 404 'Item not found'
it('returns 404 for unknown or non-numeric ids', ...);
// GET /api/lists/999 and /abc → 'List not found'; items/999 and items/abc → 'Item not found'; POST items on list 999 → 'List not found'
```

- [ ] **Step 2: Run and confirm failure**

Run from `server/`: `node node_modules/vitest/vitest.mjs run __tests__/lists.test.js`
Expected: the new tests FAIL; Task 1 tests still pass.

- [ ] **Step 3: Implement the item routes in `server/routes/lists.js`**

Routes: `GET /:id`, `POST /:id/items`, `PUT /:id/items/:itemId`, `DELETE /:id/items/:itemId`, `POST /:id/clear-checked`.
- Items query: `LEFT JOIN users ON users.id = list_items.checked_by`, selecting `users.display_name AS checked_by_name`, with `ORDER BY (checked_at IS NOT NULL), CASE WHEN checked_at IS NULL THEN list_items.id END ASC, checked_at DESC, list_items.id DESC`.
- Every item route looks up the list first (404 "List not found"), then the item with `WHERE id = ? AND list_id = ?` (404 "Item not found").
- Checking uses `UPDATE ... SET checked_by = ?, checked_at = datetime('now') WHERE id = ? AND checked_at IS NULL` so a second check changes nothing.
- A non-boolean `checked` returns 400 with "checked must be true or false".
- Too-long text returns 400 with "Item text must be 200 characters or fewer".
- PUT and POST return the item through the same joined select, so `checked_by_name` is always present.

- [ ] **Step 4: Run the whole server suite**

Run from `server/`: `node node_modules/vitest/vitest.mjs run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add server/routes/lists.js server/__tests__/lists.test.js
git commit -m "feat: add list item routes with check, delete and clear"
```

---

### Task 3: Client API methods and list helpers

**Files:**
- Modify: `client/src/api.js`
- Create: `client/src/pages/listsLogic.js`
- Test: `client/src/__tests__/listsLogic.test.js`

**Interfaces:**
- Produces, on the `api` object:
  - `getLists()`, `createList(name)`, `getList(id)`, `renameList(id, name)`, `deleteList(id)`
  - `addListItem(listId, text)`, `setListItemChecked(listId, itemId, checked)`, `deleteListItem(listId, itemId)`, `clearCheckedItems(listId)`
- Produces: `progressLabel(itemCount: number, checkedCount: number): string` and `splitItems(items: Item[]): { open: Item[], done: Item[] }`.
- Produces: errors thrown by `api` calls gain a numeric `status` property, so the page can tell a 404 from other failures.

- [ ] **Step 1: Write failing tests in `client/src/__tests__/listsLogic.test.js`**

```js
describe('progressLabel', () => {
  it.each([
    [0, 0, 'Nothing here yet'],
    [8, 3, '3 of 8 done'],
    [1, 0, '0 of 1 done'],
    [4, 4, 'All done'],
  ])('items %i, checked %i → %s', (items, checked, label) => {
    expect(progressLabel(items, checked)).toBe(label);
  });
});

describe('splitItems', () => {
  it('separates open and done items and keeps the given order', () => {
    const items = [
      { id: 2, checked_at: null },
      { id: 5, checked_at: null },
      { id: 4, checked_at: '2026-11-09 10:00:00' },
      { id: 1, checked_at: '2026-11-08 10:00:00' },
    ];
    const { open, done } = splitItems(items);
    expect(open.map((i) => i.id)).toEqual([2, 5]);
    expect(done.map((i) => i.id)).toEqual([4, 1]);
  });
  it('returns empty arrays for an empty list', () => {
    expect(splitItems([])).toEqual({ open: [], done: [] });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run from `client/`: `node node_modules/vitest/vitest.mjs run src/__tests__/listsLogic.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `listsLogic.js`, add the nine `api` methods, and set `err.status = res.status` on the error thrown in `request()`**

Paths and methods come from the spec's API table. Bodies: `{ name }`, `{ text }`, `{ checked }`.

- [ ] **Step 4: Run the whole client suite**

Run from `client/`: `node node_modules/vitest/vitest.mjs run`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/api.js client/src/pages/listsLogic.js client/src/__tests__/listsLogic.test.js
git commit -m "feat: add client API methods and helpers for shared lists"
```

---

### Task 4: Lists page

**Files:**
- Create: `client/src/pages/Lists.jsx` (exports `ListsPage`)
- Create: `client/src/components/ListDetail.jsx` (exports `ListDetail`)
- Modify: `client/src/components/Icons.jsx` (add `ListIcon`, `CheckIcon`, `ArrowLeftIcon`)
- Modify: `client/src/App.jsx` (add `{ id: 'lists', label: 'Lists', Icon: ListIcon }` to `TABS` after `notes`, and render `<ListsPage />`)
- Modify: `client/src/index.css` (new "Lists" section before "Games (shared)"; one rule in the phone media query if the five tabs need tighter padding)

**Interfaces:**
- Consumes: the `api` methods, `err.status`, `progressLabel` and `splitItems` from Task 3; `CuteCat`, `TrashIcon`, `PencilIcon` and the shared CSS classes.
- Produces: `<ListsPage />` with no props; `<ListDetail listId={number} onBack={(message?: string) => void} />`.

- [ ] **Step 1: Build `ListsPage` (overview)**

State: `lists`, `loaded`, `selectedListId`, `name`, `error`, `submitting`, `notice`.
- Renders `<ListDetail>` when `selectedListId` is set, otherwise the overview from the spec: heading "Lists", subtitle "Things to do, buy and watch together.", the "New list" form (input with `maxLength={60}`, placeholder "Groceries, bucket list…", button "Create"), then list cards.
- Each card is a `<button>` showing the name and `progressLabel(item_count, checked_count)`.
- Empty state only when `loaded` and there are no lists: cat mascot, "No lists yet", "Start one for groceries, date ideas or a bucket list."
- A failed load shows the error and no empty state.
- Create button is disabled while `submitting`. On success the name clears and the overview reloads.
- `onBack(message)` clears `selectedListId`, sets `notice` to the message if given, and reloads. The notice renders with the existing `.banner` class.
- Reloads on `document` `visibilitychange` when `document.visibilityState === 'visible'`; the listener is removed on unmount.

- [ ] **Step 2: Build `ListDetail`**

State: `list`, `text`, `error`, `submitting`, `renaming`, `draftName`, `confirmingDelete`.
- Header: a "Back to lists" button with `ArrowLeftIcon`, the list name as `h1.page-title`, rename and delete icon buttons with `aria-label`s.
- Rename mode: input (`maxLength={60}`) prefilled with the name, Save and Cancel.
- Delete confirmation, inline in a card: text `Delete this list and its ${n} items?` (use "1 item" for one, and `Delete this list?` for zero), buttons "Delete" and "Cancel". Confirming calls `api.deleteList` then `onBack()`.
- Add form: input (`maxLength={200}`, placeholder "Add an item…"), button "Add", disabled while `submitting`. After a successful add the text clears and the input is focused again (a ref).
- Items from `splitItems(list.items)`: `open` rows, then `done` rows. Each row is a `<label>` wrapping a real `<input type="checkbox">` (visually replaced by a styled box with `CheckIcon`), the text, and a delete icon button labelled `Delete ${item.text}`. Done rows add "checked by {checked_by_name}".
- "Clear checked ({done.length})" button, rendered only when `done.length > 0`.
- Empty list: muted text "Nothing here yet. Add the first item above."
- Every action awaits its API call, then reloads the list. Any error with `err.status === 404` and message "List not found" calls `onBack('That list was deleted.')`. Any other error is shown inline, and the list reloads so the page matches the server.
- Reloads on `visibilitychange` exactly as the overview does.

- [ ] **Step 3: Add styles**

Classes: `.lists-page` (same column width as `.notes-page`), `.list-create`, `.list-cards`, `.list-card`, `.list-card-name`, `.list-card-progress`, `.list-header`, `.list-back`, `.list-items`, `.list-item`, `.list-item.done`, `.list-check`, `.list-item-text`, `.list-item-by`, `.list-clear`.
- `.list-item-text` and `.list-card-name` use `overflow-wrap: anywhere` and `min-width: 0`.
- `.list-item.done .list-item-text` uses `text-decoration: line-through` and `color: var(--muted)`.
- The checkbox box is at least 24px and the row at least 44px tall for touch.
- A focused checkbox shows the standard `var(--focus)` ring on its styled box.

- [ ] **Step 4: Run tests and build**

Run from `client/`: `node node_modules/vitest/vitest.mjs run` then `node node_modules/vite/bin/vite.js build`
Expected: all tests pass; build completes with no errors.

- [ ] **Step 5: Check in the browser**

Start the server against a throwaway database with two test users (set `DB_PATH`, `PORT`, `USER1_*`, `USER2_*` in a launcher script outside the repo; the server serves `client/dist`). At 1280px and at 375px wide, confirm each of these:
- Five tabs fit in the top bar and in the phone bottom bar with no overlap.
- Create a list; it appears with "Nothing here yet". Open it, add three items in a row without clicking back into the field.
- Check one item: it moves below, crossed out, with "checked by" and the right name. Overview shows "1 of 3 done".
- Log in as the second user in the same browser: the checked item shows the first user's name. Check the rest: overview shows "All done".
- Clear checked removes them. Rename works. Delete asks first, then returns to the overview.
- Add an item of 200 characters with no spaces: it wraps, and `document.documentElement.scrollWidth === clientWidth` at 375px.
- Double-click Add quickly: one item is created.
- Delete a list through the API while it is open in the page, then act on it: the page returns to the overview showing "That list was deleted."
- No errors in the browser console apart from the expected 401 before login.

- [ ] **Step 6: Commit and push**

```bash
git add client/src
git commit -m "feat: add Lists page with shared checklists"
git push origin master
```
