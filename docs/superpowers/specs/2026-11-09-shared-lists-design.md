# Shared Lists — Design

## Purpose

Give the two users of R&S Web a place to keep checklists together:
groceries, a bucket list, date ideas, movies to watch. Either person
can add to a list or tick something off from their own phone, and the
other sees it the next time they look.

Success looks like: both people can create a list, add items, check
them off, and see each other's changes without any setup, using a page
that looks and behaves like the rest of the site.

## Decisions made with the user

- Lists are **created by the users**: any number of named lists, which
  can be renamed and deleted.
- Checked items **stay on the list, crossed out**, at the bottom, and
  show who checked them. A "Clear checked" button removes them.
- Both users have full control over every list and item (same rule as
  calendar events). There is no per-user ownership.
- Sync is **refresh on action and on return to the page**. No polling
  and no live push.

## What the user sees

A new **Lists** tab sits between Notes and Wordle, with its own icon.

**Lists overview** (default view of the tab)
- Page heading "Lists" with a short subtitle.
- A "New list" form: one text field and a "Create" button.
- One card per list, newest first, showing the list name and a
  progress line: "3 of 8 done", "Nothing here yet" for an empty list,
  or "All done" when every item is checked.
- Tapping a card opens that list.
- Empty state (no lists at all): the cat mascot with "No lists yet".

**Single list view**
- A "Back to lists" link, the list name as the heading, and two icon
  buttons: rename and delete.
- Rename swaps the heading for a text field with Save and Cancel.
- Delete asks for confirmation in the page ("Delete this list and its
  5 items?" with Delete and Cancel buttons) before doing anything.
- An "Add item" form: one text field and an "Add" button. The field
  keeps focus after adding so several items can be typed in a row.
- Unchecked items first, in the order they were added. Each row has a
  checkbox, the text, and a delete icon.
- Checked items below, most recently checked first, crossed out and
  dimmed, with "checked by Ryan" underneath.
- A "Clear checked (3)" button, shown only when at least one item is
  checked.

Layout follows the Notes page: a single centered column, cards, the
existing buttons, fields, icon buttons and empty-state styles. It must
work at phone width with no horizontal scrolling.

## Data model

Two new tables in `server/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES lists(id),
  text TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  checked_by INTEGER REFERENCES users(id),
  checked_at TEXT
);
```

An item is checked when `checked_at` is not null. `checked_by` and
`checked_at` are always set together and cleared together.

The database connection does not enable SQLite foreign key
enforcement, so nothing cascades automatically. Deleting a list
deletes its items explicitly, in the same transaction.

`CREATE TABLE IF NOT EXISTS` means the tables appear on the Pi's
existing database the next time the container starts. No migration
step and no change to existing data.

## API

New router `server/routes/lists.js`, mounted at `/api/lists` behind
`requireAuth`, following the structure of `routes/notes.js`.

| Method and path | Body | Result |
| --- | --- | --- |
| `GET /api/lists` | | All lists, newest first, each with `item_count` and `checked_count` |
| `POST /api/lists` | `{ name }` | 201 with the new list |
| `GET /api/lists/:id` | | The list plus `items`, sorted as shown in the UI, each with `checked_by_name` |
| `PUT /api/lists/:id` | `{ name }` | The renamed list |
| `DELETE /api/lists/:id` | | `{ ok: true }`; removes the list and its items |
| `POST /api/lists/:id/items` | `{ text }` | 201 with the new item |
| `PUT /api/lists/:id/items/:itemId` | `{ checked }` (boolean) | The updated item |
| `DELETE /api/lists/:id/items/:itemId` | | `{ ok: true }` |
| `POST /api/lists/:id/clear-checked` | | `{ ok: true, removed: <count> }` |

Validation and errors, all as JSON `{ error }`:
- `name` is trimmed; empty gives 400 "List name is required"; longer
  than 60 characters gives 400.
- `text` is trimmed; empty gives 400 "Item text is required"; longer
  than 200 characters gives 400.
- `checked` must be a boolean, otherwise 400.
- Unknown list id gives 404 "List not found".
- Unknown item id, or an item that belongs to a different list than
  the one in the path, gives 404 "Item not found".

Checking an item sets `checked_by` to the session user and
`checked_at` to now. Unchecking clears both. Checking an item that is
already checked leaves the original `checked_by` and `checked_at`
unchanged.

Item ordering is done in SQL: unchecked first by `id` ascending, then
checked by `checked_at` descending (ties broken by `id` descending).

## Client

- `client/src/api.js`: one method per route above.
- `client/src/pages/Lists.jsx`: the `ListsPage` component. It holds
  `selectedListId` in state and renders either the overview or the
  single list view. No URL routing, matching how the app switches tabs
  today. The overview lives in this file; the single list view is its
  own component in `client/src/components/ListDetail.jsx`.
- `client/src/pages/listsLogic.js`: pure helpers with unit tests.
  - `progressLabel(itemCount, checkedCount)` returns the overview
    card text.
  - `splitItems(items)` returns `{ open, done }` for rendering.
- `client/src/components/Icons.jsx`: add a `ListIcon` and a
  `CheckIcon`.
- `client/src/App.jsx`: add the Lists tab.
- `client/src/index.css`: list card, item row, checkbox and
  crossed-out styles, using the existing design tokens.

**Refresh behavior.** After every create, rename, check, uncheck,
delete or clear, the affected view reloads from the server. Both views
also reload when the browser tab becomes visible again
(`visibilitychange`), which covers switching back to the app on a
phone. If the open list was deleted by the other person, the reload
gets a 404; the page returns to the overview and shows "That list was
deleted."

**Errors.** API errors show in the page's existing inline error style
and leave what was typed in place. A failed load shows the error
instead of an empty state, so "could not load" is never mistaken for
"no lists".

## Testing

- `server/__tests__/lists.test.js`, using the in-memory database and
  logged-in agents as in `notes.test.js`:
  - create, list with counts, rename, delete (items go too);
  - add item, check, uncheck, delete item, clear checked;
  - one user checks, the other user sees `checked_by_name`;
  - item ordering;
  - every validation and 404 case listed above, including an item id
    addressed through the wrong list;
  - all routes reject an unauthenticated request with 401.
- `client/src/__tests__/listsLogic.test.js` for the two helpers.
- Manual check in the browser at desktop and phone width, logged in
  as each of the two accounts: create a list, add items, check as one
  user, confirm the other sees it after returning to the tab, clear
  checked, rename, delete.

## Deployment

No new environment variables, volumes or dependencies. On the Pi:
`git pull`, then `docker compose up -d --build app`. The nightly
backup already covers the new tables because they are in the same
SQLite file.

## Out of scope

- Reordering items by dragging.
- Editing an item's text after it is added (delete and re-add).
- Due dates, assigning items to one person, or notes on items.
- Live updates or polling.
- Undo for delete or clear.
