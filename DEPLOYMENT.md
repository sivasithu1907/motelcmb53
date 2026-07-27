# Motel CMB 53 — Deployment Guide

## Prerequisites

- Ubuntu 22.04 LTS VPS (Hetzner or equivalent)
- Docker + Docker Compose installed
- DuckDNS domain configured to point at the server IP
- Ports 80 and 443 open in firewall

---

## Environment Variables

Copy and fill in all values before first deploy:

```bash
cp .env.example .env
nano .env
```

### Required variables

```env
# Domain
APP_DOMAIN=motelcmb53.duckdns.org

# Database
POSTGRES_DB=motelcmb53
POSTGRES_USER=motelcmb53
POSTGRES_PASSWORD=<strong-random-password>
DATABASE_URL=postgresql://motelcmb53:<password>@db:5432/motelcmb53

# Security
COOKIE_SECRET=<32-random-bytes-hex>
ALLOWED_ORIGINS=https://motelcmb53.duckdns.org

# File uploads
UPLOAD_DIRECTORY=/app/uploads/documents
MAX_FILE_SIZE_MB=10

# Timezone
TZ=Asia/Colombo
NODE_ENV=production
```

Generate secure random values:

```bash
openssl rand -hex 32   # for COOKIE_SECRET
openssl rand -hex 16   # for POSTGRES_PASSWORD
```

---

## First-Time Deployment

```bash
# 1. Clone repository to server
ssh root@<server-ip>
git clone https://github.com/sivasithu1907/motelcmb53.git /opt/motelcmb53
cd /opt/motelcmb53

# 2. Configure environment
cp .env.example .env
nano .env   # fill in all required values

# 3. Start services
docker compose up -d --build

# 4. Run migrations — REQUIRED, creates all tables
docker compose exec backend npx prisma migrate deploy

# 5a. Seed demo data (development only)
docker compose exec backend npx tsx prisma/seed.ts

# 5b. Production: run migrations only, then create admin via app
#     (demo seed creates weak credentials — do not use on production)

# 6. Verify
curl https://motelcmb53.duckdns.org/api/health
```

---

## Standard Deploy Workflow

```bash
# On laptop after edits — push to GitHub as usual

# On server:
ssh root@<server-ip>
cd /opt/motelcmb53
git pull origin main
docker compose up -d --build

# Only if Prisma schema changed:
docker compose exec backend npx prisma migrate deploy
```

---

## Database Migrations

This project uses **Prisma Migrate** — not `prisma db push`.

Migration files live in `backend/prisma/migrations/`. Always commit them.
Never edit or delete existing migration files.

```bash
# Deploy pending migrations
docker compose exec backend npx prisma migrate deploy

# Check status
docker compose exec backend npx prisma migrate status
```

---

## Backup

```bash
# Manual backup
docker compose exec db pg_dump -U motelcmb53 motelcmb53 \
  | gzip > /opt/backups/$(date +%Y%m%d_%H%M%S).sql.gz

# Restore
gunzip -c /opt/backups/20250127_120000.sql.gz \
  | docker compose exec -T db psql -U motelcmb53 motelcmb53
```

Daily cron (add to server crontab):

```
0 2 * * * cd /opt/motelcmb53 && docker compose exec -T db pg_dump -U motelcmb53 motelcmb53 \
  | gzip > /opt/backups/$(date +\%Y\%m\%d).sql.gz && find /opt/backups -mtime +30 -delete
```

---

## Health Checks

```bash
docker compose ps
curl https://motelcmb53.duckdns.org/api/health
docker compose logs backend --tail 50
docker compose logs proxy --tail 50
```

---

## Demo Credentials (development only)

| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@thedreamv.com | SuperAdmin@2026 |
| Owner/Admin | admin@motelcmb53.lk | Admin@2026 |
| Building Manager | manager@motelcmb53.lk | Manager@2026 |
| Operator | operator@motelcmb53.lk | Operator@2026 |
| Cashier | cashier@motelcmb53.lk | Cashier@2026 |

**Change all passwords immediately after first production login.**
