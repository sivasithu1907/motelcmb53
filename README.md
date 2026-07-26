# Motel CMB 53 — Management System

A full-stack room booking management system for Motel CMB 53, Colombo.

## Features

- **Live Room Board** — real-time status (Vacant / Reserved / Occupied / Cleaning / Maintenance)
- **Booking Wizard** — 4-step booking with real availability checking (no double-booking)
- **Check-In** — identity document required before check-in; document upload + audit trail
- **Checkout** — atomic invoice creation + room moves to Cleaning
- **Billing** — invoices, payments, deposits, partial payments, manager overrides
- **Role-Based Access** — 6 roles with granular permissions enforced on every endpoint
- **Reports** — revenue, occupancy, cashier collections, booking summary
- **Audit Log** — immutable audit trail for all controlled actions
- **Settings** — all configuration stored in PostgreSQL (not localStorage)
- **Multi-Building** — building-scoped access and data

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS 3 |
| State | TanStack Query v5 |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16 + Prisma ORM |
| Auth | HTTP-only cookie sessions + Argon2 passwords |
| Proxy | Caddy (auto-HTTPS) |
| Deploy | Docker Compose |

## Quick Start (Development)

```bash
# 1. Install all dependencies
npm run install:all

# 2. Start PostgreSQL (Docker)
docker compose up db -d

# 3. Set up backend environment
cp .env.example backend/.env
# Edit backend/.env with your DB URL and COOKIE_SECRET

# 4. Generate Prisma client + run migrations + seed
npm run db:generate
npm run db:migrate
npm run db:seed

# 5. Start both servers (hot reload)
npm run dev
```

Frontend: http://localhost:5173  
Backend API: http://localhost:3001

## Demo Login Credentials

| User | Email | Password | Role |
|------|-------|----------|------|
| Admin | admin@motelcmb53.lk | Admin@2025! | OwnerAdmin |
| Manager | manager@motelcmb53.lk | Manager@2025! | BuildingManager |
| Operator | operator@motelcmb53.lk | Operator@2025! | Operator |
| Cashier | cashier@motelcmb53.lk | Cashier@2025! | Cashier |
| Read-Only | readonly@motelcmb53.lk | Readonly@2025! | ReadOnly |

## Deployment (Production)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full production deployment guide.

```bash
cp .env.example .env
# Edit .env with production values
docker compose up -d --build
```

## Business Rules

- **A/C surcharge**: LKR 2,500/night added on top of base rate — never doubled
- **Check-in**: Identity document (front) must be on file before check-in is allowed
- **Checkout**: Creates a stored, numbered invoice atomically; room moves to Cleaning
- **Cleaning → Vacant**: Requires explicit action from BuildingManager or higher
- **Payment is source of truth**: `paidAmount` is sum of all non-reversed payments
- **Availability**: Uses date-overlap SQL inside a transaction to prevent race conditions

## Project Structure

```
motel-cmb-53/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema (20 tables)
│   │   └── seed.ts         # Seed data
│   └── src/
│       ├── routes/         # All API endpoints
│       ├── middleware/      # Auth, error handling
│       └── services/       # Pricing, audit
├── frontend/
│   └── src/
│       ├── pages/          # All 17 pages
│       ├── components/     # UI + layout components
│       ├── lib/            # Auth context, utils
│       └── api/            # Axios client
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── Caddyfile
└── docker-compose.yml
```
