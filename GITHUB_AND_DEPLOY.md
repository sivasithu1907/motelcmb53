# GitHub & Hetzner Deployment Guide — Motel CMB 53

## Overview
Phase 1 → Push to GitHub (private repo)  
Phase 2 → Create Hetzner server  
Phase 3 → Point your domain  
Phase 4 → Deploy on the server  
Phase 5 → First-time database setup  
Phase 6 → Ongoing updates  

---

## PHASE 1 — Push to GitHub

### 1.1 Create a .gitignore

Create this file at the project root before anything else:

```
# Dependencies
node_modules/
frontend/node_modules/
backend/node_modules/

# Build output
frontend/dist/
backend/dist/

# Secrets — NEVER commit this
.env

# Uploads (not version controlled)
uploads/

# OS / editor
.DS_Store
*.log
```

### 1.2 Create repository on GitHub

1. Go to https://github.com/new
2. Name: `motel-cmb-53`
3. Set to **Private**
4. Do NOT initialize with README (you already have one)
5. Click **Create repository**

### 1.3 Push your code

Run this on your local machine from the `motel-cmb-53/` folder:

```bash
git init
git add .
git commit -m "Initial production build"
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/motel-cmb-53.git
git push -u origin main
```

Verify at https://github.com/YOUR_GITHUB_USERNAME/motel-cmb-53 — you should see all files but NO `.env` file.

---

## PHASE 2 — Create Hetzner Server

### 2.1 Recommended server spec

Log in at https://console.hetzner.cloud and create a new project.

**Server type:** CX22 (2 vCPU / 4 GB RAM / 40 GB SSD) — ~€4.15/month  
*(This comfortably runs Postgres + backend + frontend + Caddy)*

**Settings:**
- Image: **Ubuntu 24.04**
- Location: pick closest to your guests (e.g. Helsinki, Nuremberg, Singapore)
- SSH keys: add your public key (see 2.2)
- Networking: Public IPv4 + IPv6 (defaults)
- Firewall: create one (see 2.3)
- Name: `motelcmb53-prod`

### 2.2 Add your SSH key (if you haven't)

On your local machine:
```bash
# Check if you have one already
cat ~/.ssh/id_ed25519.pub

# If not, create one
ssh-keygen -t ed25519 -C "motelcmb53-deploy"
cat ~/.ssh/id_ed25519.pub
```

Copy the output and paste it in Hetzner → SSH Keys → Add SSH Key.

### 2.3 Create a Firewall

In Hetzner → Firewalls → Create Firewall, add these **inbound** rules:

| Protocol | Port | Source |
|----------|------|--------|
| TCP | 22 | Your IP only (find yours at https://ipinfo.io) |
| TCP | 80 | Any (0.0.0.0/0) |
| TCP | 443 | Any (0.0.0.0/0) |

Assign the firewall to your new server.

---

## PHASE 3 — Point Your Domain

In your domain registrar's DNS panel, add:

```
A     @     <your-server-IPv4>    TTL 300
AAAA  @     <your-server-IPv6>    TTL 300
```

To find your server IP: Hetzner Console → your server → the IP is shown at the top.

DNS can take 5–30 minutes to propagate. Check with:
```bash
nslookup your.domain.com
```

---

## PHASE 4 — Server Setup (run once)

SSH into your server:
```bash
ssh root@<your-server-ip>
```

### 4.1 System updates and tools

```bash
apt update && apt upgrade -y
apt install -y git curl ufw fail2ban
```

### 4.2 Firewall (UFW)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow from <YOUR_HOME_IP> to any port 22    # SSH only from your IP
ufw allow 80
ufw allow 443
ufw --force enable
ufw status
```

Replace `<YOUR_HOME_IP>` with your actual IP from https://ipinfo.io

### 4.3 Create a deploy user (don't run everything as root)

```bash
adduser deploy
usermod -aG sudo docker   # after docker installs — revisit step 4.5

# Copy your SSH key to deploy user
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

### 4.4 Harden SSH

```bash
nano /etc/ssh/sshd_config
```

Set these:
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

```bash
systemctl restart sshd
```

**Test that you can still log in** in a new terminal as `deploy` before closing the root session:
```bash
ssh deploy@<your-server-ip>
```

### 4.5 Install Docker

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
newgrp docker
```

Log out and back in (or run `newgrp docker`) for the group to take effect.

### 4.6 Clone your repo

```bash
cd /opt
sudo mkdir motelcmb53
sudo chown deploy:deploy motelcmb53
cd motelcmb53
git clone https://github.com/YOUR_GITHUB_USERNAME/motel-cmb-53.git .
```

If the repo is private, GitHub will ask for credentials. Use a **Personal Access Token** instead of your password:  
GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → check `repo` scope → copy token.

Use it as the password when git prompts.

---

## PHASE 5 — Configure and First Launch

### 5.1 Create your .env file

```bash
cd /opt/motelcmb53
cp .env.example .env
nano .env
```

Fill in every value:

```env
POSTGRES_DB=motelcmb53
POSTGRES_USER=motelcmb53
POSTGRES_PASSWORD=<generate: openssl rand -hex 20>

COOKIE_SECRET=<generate: openssl rand -hex 32>

APP_DOMAIN=your.domain.com
ALLOWED_ORIGINS=https://your.domain.com

MAX_FILE_SIZE_MB=10
```

Generate the secrets **on the server**:
```bash
openssl rand -hex 20   # use for POSTGRES_PASSWORD
openssl rand -hex 32   # use for COOKIE_SECRET
```

### 5.2 Build and start all containers

```bash
docker compose up -d --build
```

This will:
- Pull Postgres 16 and Caddy images
- Build backend (npm install + prisma generate + tsc)
- Build frontend (npm install + vite build)
- Start all 4 containers
- Caddy will automatically get a free TLS certificate from Let's Encrypt

Watch progress:
```bash
docker compose logs -f
```

Wait until you see:
```
motelcmb53_api   | Server running on port 3001
motelcmb53_proxy | ... certificate obtained
```

### 5.3 Run database migrations

```bash
docker compose exec backend npx prisma migrate deploy
```

### 5.4 Seed demo data (optional but recommended for first launch)

```bash
docker compose exec backend node -e "
const { execSync } = require('child_process');
execSync('npx ts-node prisma/seed.ts', { stdio: 'inherit' });
"
```

If ts-node isn't available in the container:
```bash
docker compose exec backend npx prisma db seed
```

### 5.5 Verify everything is running

```bash
# All 4 containers should show "Up"
docker compose ps

# Check backend health
curl http://localhost:3001/health

# Check logs for errors
docker compose logs backend --tail=50
docker compose logs proxy --tail=20
```

Visit `https://your.domain.com` in your browser — you should see the login page with a padlock (HTTPS).

**Login:**  
Email: `admin@motelcmb53.lk`  
Password: `Admin@2025!`

---

## PHASE 6 — Ongoing Updates (deploy new code)

Whenever you push changes to GitHub:

```bash
# On your local machine
git add .
git commit -m "describe your change"
git push origin main
```

Then on the Hetzner server:

```bash
ssh deploy@<your-server-ip>
cd /opt/motelcmb53
git pull origin main
docker compose up -d --build
```

If you changed the database schema:
```bash
docker compose exec backend npx prisma migrate deploy
```

---

## Backup (run weekly via cron)

```bash
# One-time: create backup directory
mkdir -p /opt/backups

# Create backup script
cat > /opt/backups/backup.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups"

# Database dump
docker exec motelcmb53_db pg_dump -U motelcmb53 motelcmb53 | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# Upload documents
docker run --rm \
  -v motelcmb53_uploads:/data \
  -v $BACKUP_DIR:/backup \
  alpine tar czf "/backup/uploads_$DATE.tar.gz" -C /data .

# Keep only last 14 days
find "$BACKUP_DIR" -name "*.gz" -mtime +14 -delete

echo "Backup complete: $DATE"
EOF

chmod +x /opt/backups/backup.sh

# Add to cron: run at 2am daily
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/backups/backup.sh >> /opt/backups/backup.log 2>&1") | crontab -
```

---

## Useful Commands

```bash
# View live logs for all services
docker compose -f /opt/motelcmb53/docker-compose.yml logs -f

# Restart a specific service
docker compose -f /opt/motelcmb53/docker-compose.yml restart backend

# Open a Postgres shell
docker compose -f /opt/motelcmb53/docker-compose.yml exec db psql -U motelcmb53 motelcmb53

# Check disk usage
df -h
docker system df

# Free up Docker cache (safe to run anytime)
docker system prune -f
```
