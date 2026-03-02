# Zigzag Microservices

Node.js + TypeScript microservices with PostgreSQL, MinIO, and RabbitMQ, orchestrated with Docker Compose.

## Project stack

- **Node.js 18**, TypeScript, Sequelize ORM 6
- **PostgreSQL 15**, **MinIO**, **RabbitMQ**
- **Services**: api-gateway, user-service, events-service, media-service, notification-service
- **docker-compose.yml** – full stack; **docker-compose.dev.yml** – local overrides (hot reload)

---

## Run locally

**Prerequisites:** Docker and Docker Compose installed.

1. **Start the stack** (Postgres, MinIO, RabbitMQ, pgAdmin + all app services with hot reload):

   ```bash
   npm run dev
   ```

   Or: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build`

2. **First time (or anytime) – create DBs and run migrations** (in another terminal, with the stack running):

   ```bash
   npm run db:setup
   ```

   Or step by step: `npm run db:create` then `npm run db:migrate`. Safe to run multiple times: if the DBs already exist, create is skipped; migrations are applied (idempotent).

3. **Stop:** `Ctrl+C` or `npm run dev:down` (from root: `docker compose -f docker-compose.yml -f docker-compose.dev.yml down`).

**Local URLs**

| Service            | URL                        |
|--------------------|----------------------------|
| API Gateway        | http://localhost:3000     |
| pgAdmin            | http://localhost:5050     |
| MinIO Console      | http://localhost:9001     |
| RabbitMQ Management| http://localhost:15672    |

pgAdmin: `admin@local.com` / `admin`. RabbitMQ: `zigzag` / value of `RABBITMQ_PASSWORD` in `.env`, or default user if set in compose.

---

## Deploy to server (Hetzner example)

Target: one VPS (e.g. Hetzner Cloud) running the full stack with Docker Compose, reverse proxy, and HTTPS.

### 1. Create the server

- [Hetzner Cloud](https://console.hetzner.cloud) → Create **Server** (e.g. Ubuntu 24.04, CPX21 or CPX31).
- Add your SSH key; note the server **IP**.

### 2. SSH and install Docker

```bash
ssh root@YOUR_SERVER_IP
```

```bash
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker
apt install -y docker-compose-plugin
docker compose version
```

### 3. Clone repo and set env

```bash
cd /opt
git clone https://github.com/YOUR_ORG/zigzag-micro-services.git
cd zigzag-micro-services
```

```bash
cp .env.example .env
nano .env   # set strong JWT_SECRET_ACCESS_TOKEN, JWT_SECRET_REFRESH_TOKEN, INTERNAL_GATEWAY_KEY, RABBITMQ_PASSWORD
```

### 4. Start the stack and run migrations

```bash
docker compose up -d --build
```

Then once (create DBs and migrate), from the repo root on the server:

```bash
npm run db:setup:prod
```

Or step by step: `npm run db:create:prod` then `npm run db:migrate:prod`. Safe to run again if DBs already exist.

**If you get `ECONNREFUSED ::1:5432`:** the container is still using old code that connects to localhost. Rebuild the images so they include the latest `createDatabase.ts`, then run the command again:

```bash
docker compose build user-service events-service --no-cache
npm run db:setup:prod
```

After any `git pull`, run `docker compose up -d --build` (or at least `docker compose build user-service events-service`) so the containers have the latest code before running `db:setup:prod`.

**Test without reverse proxy:** You can skip step 5 and test the API over HTTP. Allow port 3000 in the server firewall (Hetzner Cloud Firewall or `ufw allow 3000`), then call the API at `http://YOUR_SERVER_IP:3000` (e.g. `http://YOUR_SERVER_IP:3000/api/v1/user/...`). For production you should use the reverse proxy and HTTPS (step 5).

### 5. Reverse proxy and HTTPS (with a domain)

**Why this step:** Your API runs inside Docker on port 3000. A **reverse proxy** in front of it serves the API over HTTPS with a proper hostname. You only need to point a **subdomain** at this server (e.g. `api.thezigzagapp.com`); the root domain (`thezigzagapp.com`) can point to your website elsewhere.

**Suggested DNS layout**

| Hostname | Points to | Use |
|----------|-----------|-----|
| **api.thezigzagapp.com** | This Hetzner server’s IP | API (this stack) |
| **thezigzagapp.com** | Your website server / host (e.g. Vercel, Netlify, or same server) | Website / app |

**Step 5a – Point the API subdomain at this server**

In your DNS provider (registrar, Cloudflare, etc.) for **thezigzagapp.com**:

- Add an **A record**: **Name** = `api`, **Value** = your Hetzner server’s **public IP** (leave TTL default).
- Do **not** point the root `@` (thezigzagapp.com) to this server unless this server is also hosting the website.
- After propagation (a few minutes), `api.thezigzagapp.com` will resolve to this server.

**Step 5b – Install a reverse proxy and get HTTPS**

Pick one option. Both get a free certificate for `api.thezigzagapp.com` and forward HTTPS traffic to your API on port 3000.

**Option A – Caddy (simplest: HTTPS and cert renewal are automatic)**

1. **Add Caddy’s repo and install** (on the server):

   ```bash
   apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
   apt update && apt install -y caddy
   ```

2. **Configure the reverse proxy.** You must create (or edit) the Caddy config file. Caddy does not create it for you. On the server, run `sudo nano /etc/caddy/Caddyfile` and paste the block below. If the file already exists (e.g. from a previous Caddy setup), replace or add the block so it contains:

   ```
   api.thezigzagapp.com {
       reverse_proxy localhost:3000
   }
   ```

   **What this does:**
   - **`api.thezigzagapp.com`** – Caddy listens for HTTPS requests to this hostname only. It will ask Let’s Encrypt for a certificate for this name (no extra config).
   - **`reverse_proxy localhost:3000`** – Every request to `https://api.thezigzagapp.com/...` is forwarded to your API gateway running on the same machine at port 3000. Caddy terminates TLS (HTTPS) and talks to your app over plain HTTP on localhost.

   So: the outside world talks to Caddy on 443 (HTTPS); Caddy talks to your Docker API on 3000 (HTTP). Only the API subdomain is handled here; `thezigzagapp.com` is not served by this Caddy, so your website can use the root domain elsewhere.

3. **Apply the config:**

   ```bash
   systemctl reload caddy
   ```

   On success there is usually **no output** (command returns to the prompt). To confirm Caddy is running: `systemctl status caddy`. If the config is invalid, Caddy will log an error and the reload may fail with a short message.

   Caddy will obtain a Let’s Encrypt certificate for `api.thezigzagapp.com` and renew it automatically.

**Option B – Nginx + Certbot**

1. Install Nginx and configure a server block for `api.thezigzagapp.com` that `proxy_pass`es to `http://127.0.0.1:3000`.
2. Install Certbot: `apt install certbot python3-certbot-nginx`.
3. Run `certbot --nginx -d api.thezigzagapp.com` to get and install the certificate.

**Result:** The API is available at **https://api.thezigzagapp.com** (e.g. `https://api.thezigzagapp.com/api/v1/user/...`). Use this base URL in your website/app. The root domain **thezigzagapp.com** stays free for your frontend.

### 6. Firewall (recommended)

- In Hetzner: create a Cloud Firewall allowing **22, 80, 443**; attach to the server.
- Or on the server: `ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw enable`.

### 7. Updates

```bash
cd /opt/zigzag-micro-services
git pull
docker compose up -d --build
```

---

## Compose files

- **docker-compose.yml** – Defines the full stack (Postgres, MinIO, RabbitMQ, pgAdmin, all app services). Use for both local (with dev override) and production.
- **docker-compose.dev.yml** – Override only: runs app services with `npm run dev`, mounts source, sets `NODE_ENV=development`. Merged with the main file when you run `npm run dev`. Do not use this file on the server.

`NODE_ENV` is set by the Compose file at runtime, not in the Dockerfiles.

---

## Sequelize commands

Run these from the relevant service directory (e.g. `zigzagmicroservices/user-service`) or via `docker compose run --rm user-service <command>`.

| Task             | Command                                                       |
|------------------|---------------------------------------------------------------|
| Create migration | `yarn sequelize-cli migration:generate --name create-xxx-table` |
| Create seeder    | `yarn sequelize-cli seed:generate --name demo-seeder`        |
| Run migrations   | `yarn sequelize-cli db:migrate`                               |
| Undo migration   | `yarn sequelize-cli db:migrate:undo`                          |
| Run seeders      | `yarn sequelize-cli db:seed:all`                              |
| Undo seeders     | `yarn sequelize-cli db:seed:undo:all`                         |
