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

## 1. Get the code onto the Pi

```bash
git clone <your-repo-url> rs-web
cd rs-web
```

## 2. Create the Cloudflare Tunnel

On any machine with `cloudflared` installed (or via the Cloudflare dashboard):

1. Log into Cloudflare: `cloudflared tunnel login`
2. Create the tunnel: `cloudflared tunnel create rs-web`
3. Route your subdomain to it: `cloudflared tunnel route dns rs-web us.yourdomain.com`
4. In the Cloudflare Zero Trust dashboard, under Access > Tunnels, find the
   tunnel and copy its **token** (this is what `cloudflared` running in
   Docker will use to authenticate — no local config file needed).

## 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set:
- `SESSION_SECRET` — a long random string (e.g. `openssl rand -hex 32`)
- `USER1_USERNAME` / `USER1_PASSWORD` / `USER1_DISPLAY_NAME`
- `USER2_USERNAME` / `USER2_PASSWORD` / `USER2_DISPLAY_NAME`
- `TUNNEL_TOKEN` — the token copied in step 2

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
volume, not part of the image.
