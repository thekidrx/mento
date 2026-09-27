# Deploying to the Raspberry Pi

## Prerequisites

- Raspberry Pi 4 or 5 running Raspberry Pi OS, on your home network.
- A domain name you control, added to a Cloudflare account (free tier is fine).
- Docker and Docker Compose installed on the Pi:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  sudo apt-get install -y docker-compose-plugin
  ```
  Log out and back in for the group change to take effect.
- The `sqlite3` CLI installed on the Pi (used by `scripts/backup.sh`):
  ```bash
  sudo apt-get install -y sqlite3
  ```

## 1. Get the code onto the Pi

```bash
git clone <your-repo-url> rs-web
cd rs-web
```

## 2. Create the Cloudflare Tunnel

This project runs `cloudflared` in Docker using a **tunnel token** (see the
`cloudflared` service in `docker-compose.yml`, which reads `TUNNEL_TOKEN`).
That means the tunnel is managed entirely from the Cloudflare dashboard —
there is no local `config.yml` and no `cloudflared` CLI work to do.

1. Open the **Cloudflare Zero Trust dashboard** → **Networks** → **Tunnels**
   and click **Create a tunnel**. Choose the **Cloudflared** connector type
   and give it a name (e.g. `rs-web`).
2. On the "Install and run a connector" screen, copy the **tunnel token**.
   It's the long string in the install command (the value after
   `--token`). This is what goes into `.env` as `TUNNEL_TOKEN` in step 3.
   You don't need to run the install command that the dashboard shows —
   Docker Compose runs the connector for you.
3. Continue to the tunnel's **Public Hostname** tab and add a public
   hostname so the tunnel knows where to send incoming traffic:
   - **Subdomain**: `us` (or whatever you chose)
   - **Domain**: `yourdomain.com`
   - **Type**: `HTTP`
   - **URL**: `app:3000`

   `app` here is the **Docker Compose service name** of the main app
   container (see `docker-compose.yml`), *not* `localhost` and not the Pi's
   IP. `cloudflared` runs in its own container on the same Compose network,
   so it reaches the app container by that service name. Using `localhost`
   would point `cloudflared` at itself and produce a 502.

   Saving the public hostname also creates the required DNS record for
   `us.yourdomain.com` automatically.

Without this public hostname mapping the tunnel will connect successfully
but serve nothing — this step is what actually routes traffic to the app.

## 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set:
- `SESSION_SECRET` — a long random string (e.g. `openssl rand -hex 32`)
- `USER1_USERNAME` / `USER1_PASSWORD` / `USER1_DISPLAY_NAME`
- `USER2_USERNAME` / `USER2_PASSWORD` / `USER2_DISPLAY_NAME`
- `TUNNEL_TOKEN` — the token copied in step 2
- `TZ` — your IANA timezone (e.g. `America/New_York`), so the daily Wordle puzzle rolls over at your actual midnight, not UTC's

`.env` is gitignored — it never leaves the Pi.

## 4. Start the app

```bash
docker compose up -d --build
```

Check both containers are running: `docker compose ps`. Check logs if
anything looks wrong: `docker compose logs -f`.

Visit `https://us.yourdomain.com` (your chosen subdomain) from any device
and confirm the login page loads and both seeded accounts can log in.

## 5. Set up daily backups

Add a cron entry to run the backup script daily at 3am:

```bash
crontab -e
```

Add this line (adjust the path to wherever you cloned the repo):

```
0 3 * * * /home/pi/rs-web/scripts/backup.sh
```

This keeps the last 14 daily copies of the SQLite database in
`data/backups/`, pruning older ones automatically.

## 6. Updating after code changes

```bash
cd rs-web
git pull
docker compose up -d --build
```

The SQLite file in `./data` is untouched by rebuilds since it's a mounted
volume, not part of the image. Login sessions are stored in that same file,
so a rebuild doesn't log anyone out.
