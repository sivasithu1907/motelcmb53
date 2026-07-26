# Deploy Now — Exact Commands
# Repo: https://github.com/sivasithu1907/motelcmb53.git
# Domain: motelcmb53.duckdns.org

## ═══════════════════════════════════════════
## PART A — YOUR LAPTOP (do this first)
## ═══════════════════════════════════════════

### A1. Extract the ZIP and push to GitHub

Unzip motel-cmb-53.zip, open a terminal inside the motel-cmb-53/ folder, then run:

  git init
  git add .
  git commit -m "Initial production build"
  git branch -M main
  git remote add origin https://github.com/sivasithu1907/motelcmb53.git
  git push -u origin main

When prompted for GitHub password, use a Personal Access Token (not your password):
  → github.com → Settings → Developer settings → Personal access tokens
  → Tokens (classic) → Generate new token → check "repo" → copy token
  → paste it as the password

Verify: open https://github.com/sivasithu1907/motelcmb53 — you should see all files.
Make sure there is NO .env file visible there.


## ═══════════════════════════════════════════
## PART B — DUCKDNS (point domain to server)
## ═══════════════════════════════════════════

### B1. Point motelcmb53.duckdns.org to your Hetzner server IP

1. Log in at https://www.duckdns.org
2. Find your domain: motelcmb53
3. In the "current ip" field, enter your Hetzner server's IPv4 address
4. Click "update ip"

You can verify it's working with:
  nslookup motelcmb53.duckdns.org

Wait until it returns your server IP before continuing.


## ═══════════════════════════════════════════
## PART C — HETZNER SERVER (SSH in as root)
## ═══════════════════════════════════════════

SSH into your server:
  ssh root@<your-server-ip>

### C1. System update + tools

  apt update && apt upgrade -y
  apt install -y git curl ufw

### C2. Firewall

  ufw default deny incoming
  ufw default allow outgoing
  ufw allow 22
  ufw allow 80
  ufw allow 443
  ufw --force enable
  ufw status

(You can tighten SSH to your IP only later. For now, 22 open is fine.)

### C3. Install Docker

  curl -fsSL https://get.docker.com | sh

Verify Docker is installed:
  docker --version
  docker compose version

### C4. Clone your repo

  cd /opt
  git clone https://github.com/sivasithu1907/motelcmb53.git motelcmb53
  cd motelcmb53

When prompted, use your GitHub username + Personal Access Token (same token from A1).

### C5. Create your .env file

  cp .env.example .env
  nano .env

The file will look like this — fill in the two CHANGE_THIS values:

  POSTGRES_DB=motelcmb53
  POSTGRES_USER=motelcmb53
  POSTGRES_PASSWORD=<generate below>

  COOKIE_SECRET=<generate below>

  APP_DOMAIN=motelcmb53.duckdns.org
  ALLOWED_ORIGINS=https://motelcmb53.duckdns.org

  MAX_FILE_SIZE_MB=10

Generate the two secrets by running these and copying the output:
  openssl rand -hex 20    ← use this for POSTGRES_PASSWORD
  openssl rand -hex 32    ← use this for COOKIE_SECRET

In nano: use arrow keys to position cursor, type the values, then:
  Ctrl+O  → save
  Enter   → confirm filename
  Ctrl+X  → exit

Double-check your .env looks correct:
  cat .env

### C6. Build and launch everything

  docker compose up -d --build

This builds both containers and starts all 4 services (db, backend, frontend, proxy).
It will take 3–5 minutes on first run.

Watch progress:
  docker compose logs -f

Press Ctrl+C when you see the backend say "Server running on port 3001".
Caddy will automatically get a free HTTPS certificate from Let's Encrypt.

### C7. Run database migrations

  docker compose exec backend npx prisma migrate deploy

### C8. Seed demo data

  docker compose exec backend node -e "
  const { execSync } = require('child_process');
  execSync('npx ts-node prisma/seed.ts', { stdio: 'inherit' });
  "

If that fails, try:
  docker compose exec backend sh -c "cd /app && node dist/index.js &" 

Or use the pre-built seed runner approach:
  docker compose exec -e SEED=1 backend node -e "
  const argon2 = require('argon2');
  const { PrismaClient } = require('@prisma/client');
  console.log('Prisma client loaded, run seed manually or via prisma db seed');
  "

The easiest approach if ts-node isn't in the container:
  docker compose exec backend sh
  # inside the container shell:
  ls /app
  exit

Then from outside:
  docker compose exec backend npx prisma db seed

### C9. Verify everything is running

  docker compose ps

All 4 should show "Up":
  motelcmb53_db       Up
  motelcmb53_api      Up
  motelcmb53_web      Up
  motelcmb53_proxy    Up

Test the backend directly:
  curl http://localhost:3001/health

### C10. Open in browser

Visit: https://motelcmb53.duckdns.org

You should see the Motel CMB 53 login page with a padlock (HTTPS).

Login:
  Email:    admin@motelcmb53.lk
  Password: Admin@2025!


## ═══════════════════════════════════════════
## PART D — FUTURE UPDATES
## ═══════════════════════════════════════════

### Deploying code changes

On your laptop after making changes:
  git add .
  git commit -m "describe your change"
  git push origin main

On the server:
  cd /opt/motelcmb53
  git pull origin main
  docker compose up -d --build

If you changed the database schema:
  docker compose exec backend npx prisma migrate deploy


## ═══════════════════════════════════════════
## TROUBLESHOOTING
## ═══════════════════════════════════════════

### Site not loading / certificate error
→ Check DuckDNS is pointing to correct IP: nslookup motelcmb53.duckdns.org
→ Check Caddy logs: docker compose logs proxy
→ Port 80/443 must be open: ufw status

### Backend errors
→ docker compose logs backend --tail=50

### Database connection failed
→ Check .env has POSTGRES_PASSWORD set
→ docker compose logs db

### "Permission denied" on git clone
→ Make sure you're using Personal Access Token, not your GitHub password

### Containers restart-looping
→ docker compose ps  (check which one)
→ docker compose logs <service-name>

### Rebuild from scratch (nuclear option)
→ docker compose down -v
→ docker compose up -d --build
→ docker compose exec backend npx prisma migrate deploy
→ re-run seed
