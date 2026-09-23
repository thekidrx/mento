# R&S Web — Shared Calendar & Notes Site

## Purpose

A private website for two people (you and your girlfriend) to:
- Share a calendar of plans/dates
- Leave notes/messages for each other

Accessible 24/7 from anywhere, self-hosted on a Raspberry Pi (Pi 4/5,
Raspberry Pi OS already installed), reachable via a real domain name
routed through Cloudflare Tunnel. No one outside the two of you should
be able to access it.

## Architecture

Single Docker container running a Node.js app on the Pi:

- **Backend**: Node.js + Express, serving both the API and the built
  frontend static files from one process.
- **Database**: SQLite, single file, stored on a Docker volume mounted
  to the host so data survives container rebuilds.
- **Frontend**: React (built with Vite), calendar view + notes view,
  served as static assets by Express — no separate frontend server.
- **Auth**: Two fixed accounts (one per person), seeded via environment
  variables at first startup. Session-based login (signed cookie),
  passwords hashed with bcrypt. No signup flow, no third-party auth.
- **Networking**: `cloudflared` runs on the Pi (either as a second
  container or a host-level service) and creates an outbound tunnel to
  Cloudflare, mapped to a subdomain of your existing domain (e.g.
  `us.yourdomain.com`). No router port-forwarding. Cloudflare handles
  TLS termination automatically.

```
[Phone/Laptop Browser]
        |
        v (HTTPS)
   Cloudflare Edge
        |
        v (outbound tunnel from Pi, no open inbound ports)
   cloudflared (on Pi)
        |
        v (localhost)
   Express app (Docker container)
        |
        v
   SQLite file (Docker volume)
```

## Data model

- `users`: id, username, password_hash, display_name
- `events`: id, title, description, date, created_by (user id), created_at
- `notes`: id, message, created_by (user id), created_at

Both users can see and edit all events/notes — no per-user privacy
within the app, since it's meant to be fully shared between the two of
you.

## Key flows

- **Login**: username + password → session cookie → redirected to
  calendar view.
- **Add/edit/delete event**: either user can create, edit, or delete
  any event. Calendar shows month view with events; clicking a day
  shows/add details.
- **Notes**: a simple running feed of messages (like a shared
  guestbook/chat), newest at top or bottom, each tagged with who wrote
  it and when. No editing/deleting others' notes — but you can delete
  your own.

## Error handling

- Invalid login → generic "invalid username or password" (no hints on
  which field was wrong).
- Session expiry → redirect to login page.
- API errors return JSON with a message; frontend shows a simple inline
  error rather than crashing the page.

## Testing

- Backend: unit tests for auth (login success/failure, session
  handling) and CRUD routes for events/notes, using an in-memory or
  temp-file SQLite DB.
- Frontend: light — manual testing is reasonable given the tiny surface
  area (calendar + notes), but basic component tests for the calendar
  and notes list are worth having.
- Manual end-to-end check before calling it done: log in as both
  accounts, add/edit/delete an event, post/delete a note, confirm data
  persists across a container restart.

## Deployment on the Pi

1. Install Docker + Docker Compose on the Pi (if not already present).
2. `docker-compose.yml` defines two services: the app (Node/Express +
   SQLite volume) and `cloudflared`.
3. Cloudflare Tunnel is created once via the Cloudflare dashboard/CLI,
   authenticated to your Cloudflare account, and mapped to your chosen
   subdomain.
4. Environment variables (seeded usernames/passwords, session secret,
   tunnel token) live in a `.env` file on the Pi, not committed to git.
5. `docker-compose up -d` starts everything; container restarts
   automatically on Pi reboot (`restart: unless-stopped`).

## Backups

A daily cron job on the Pi copies the SQLite file to a dated file in a
local `backups/` folder (keeping the last ~14 days, pruning older
ones) — since it's the only copy of your shared data. This is a
minimal safety net against accidental deletion or a bad update; it
does not protect against the Pi itself failing (SD card death, fire,
theft). If that stronger guarantee matters later, the same cron job
can be pointed at a synced cloud folder or a remote `scp` target
instead — swapping the destination is a one-line change.

## Out of scope for v1

- Photo sharing, to-do lists, countdown widgets — explicitly deferred
  per YAGNI; can be added later as separate features once the base
  site is live.
- Third-party OAuth login — not needed for two fixed accounts.
- Multi-device push notifications — not required for v1.
