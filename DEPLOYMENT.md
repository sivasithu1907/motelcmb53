# Deployment Guide — Motel CMB 53

## Prerequisites

- Ubuntu 22.04 VPS with at least 2GB RAM
- Domain name pointed to server IP (A record)
- Ports 80 and 443 open in firewall

## 1. Server Setup

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER
newgrp docker

# Clone or upload project
git clone <your-repo> /opt/motelcmb53
cd /opt/motelcmb53
```

## 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

Fill in:
```
POSTGRES_PASSWORD=<strong-random-password>
COOKIE_SECRET=<64-char-random-string>
APP_DOMAIN=motelcmb53.duckdns.org
ALLOWED_ORIGINS=https://motelcmb53.duckdns.org
```

Generate secrets:
```bash
openssl rand -hex 32   # for POSTGRES_PASSWORD
openssl rand -hex 32   # for COOKIE_SECRET
```

## 3. First Launch

```bash
# Build and start all services
docker compose up -d --build

# Wait for DB to be ready, then run migrations and seed
docker compose exec backend npx prisma migrate deploy
docker compose exec backend node dist/seed.js
# OR (if ts-node available in container)
docker compose exec backend npx ts-node prisma/seed.ts
```

## 4. Verify

```bash
# Check all containers running
docker compose ps

# Check backend health
curl http://localhost:3001/health

# Check logs
docker compose logs -f backend
```

Visit `https://motelcmb53.duckdns.org` — Caddy handles HTTPS automatically via Let's Encrypt.

## 5. Ongoing Operations

```bash
# View logs
docker compose logs -f

# Restart a service
docker compose restart backend

# Update and redeploy
git pull
docker compose up -d --build

# Database console
docker compose exec db psql -U motelcmb53 motelcmb53
```

## File Uploads

Uploaded guest documents are stored in the Docker volume `motelcmb53_uploads`.

```bash
# Back up uploads
docker run --rm -v motelcmb53_uploads:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .
```

## Security Hardening

```bash
# Firewall (UFW)
ufw allow 22
ufw allow 80
ufw allow 443
ufw enable

# Fail2ban for SSH
apt install fail2ban -y
```

## Changing Passwords After Deployment

Admin passwords are set in seed.ts and hashed with Argon2. To change a password:

1. Login as OwnerAdmin
2. Go to Users & Roles → select user → (future: change password)
3. Or via backend CLI:
```bash
docker compose exec backend node -e "
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const db = new PrismaClient();
argon2.hash('NewPassword@2025!').then(hash =>
  db.user.update({ where: { email: 'admin@motelcmb53.lk' }, data: { passwordHash: hash } })
).then(() => { console.log('done'); process.exit(0); });
"
```
