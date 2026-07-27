# Motel CMB 53 — Security Reference

## Authentication

| Mechanism | Implementation |
|-----------|----------------|
| Password hashing | Argon2id |
| Session storage | PostgreSQL `Session` table (not memory, survives restart) |
| Session cookie | HTTP-only, `SameSite=Lax`, `Secure` in production |
| Session token | Random CUID2 (not predictable sequence) |
| Login rate limit | 20 attempts per 15 minutes (express-rate-limit) |
| Session expiry | Enforced server-side on every request |

**Never stored in localStorage or sessionStorage.**

---

## Role-Based Access Control

Six roles with numeric hierarchy. Every API route uses an action-specific
permission guard rather than the broad `canWrite`/`canManage` flags.

| Role | Level | Key capabilities |
|------|-------|-----------------|
| SuperAdmin | 100 | All orgs, all buildings, technical admin |
| OwnerAdmin | 90 | All buildings in their org, full operational access |
| BuildingManager | 70 | Assigned buildings, rate overrides, discounts, cancellations |
| Operator | 50 | Check-in, check-out, reservations, guest registration |
| Cashier | 40 | View bookings/invoices, record payments, print |
| ReadOnly | 10 | View only, no modifications |

**Backend authorization is enforced on every route.** Frontend role checks
are for UX only and must never be the sole access control.

---

## Multi-Tenancy

Every data access is scoped by `organizationId`:

- Users belong to an Organization
- Buildings belong to an Organization
- Guests have an `organizationId` field (FK to Organization)
- Bookings have an `organizationId` field (denormalized from Building for query performance)
- Guest searches, document uploads, and payment reads all filter by org

A user from Org A cannot read, write, or enumerate data belonging to Org B.

---

## Building Access Control

Non-admin users (Operator, Cashier, ReadOnly) are restricted to buildings
explicitly assigned in `UserBuildingAccess`. SuperAdmin and OwnerAdmin have
org-wide access without building-level assignment.

---

## Guest Data Protection

| Control | Implementation |
|---------|---------------|
| Document number in lists | Masked (`**********5678`) |
| Raw document number in API | Stripped from all list/detail responses |
| Raw number accessible | Only on explicit authenticated endpoints (not yet built — marked as TODO) |
| Identity documents | Stored server-side in `/uploads/documents/`, random filenames |
| Document URLs | Served through authenticated `/api/documents/:id` endpoint only |
| Public access | None — no static file serving of upload directory |
| File validation | Extension + MIME type + file signature (magic bytes) |
| Accepted formats | JPEG, PNG, WebP only (PDF not accepted for identity docs) |
| Document access | Audit logged on every view |

---

## Document Upload Security

```
1. Multer rejects files where MIME ∉ {image/jpeg, image/png, image/webp}
2. After save: file signature (first 12 bytes) must match claimed MIME
3. If signature fails: file deleted, 422 returned
4. Path traversal: guestId validated as /^[a-z0-9_-]+$/i before use
5. Stored filename: random CUID2 (doc_<cuid>), no user input in path
6. Upload directory: resolved at startup, absolute path only
```

---

## HTTP Security Headers

Helmet is applied with:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Embedder-Policy: disabled` (required for Vite dev)
- `Content-Security-Policy: disabled` (to be enabled in a future hardening pass)

---

## Recommended Production Hardening (not yet applied)

- [ ] Enable Content-Security-Policy header
- [ ] Add CSRF double-submit cookie for state-changing requests
- [ ] Implement refresh token rotation
- [ ] Force-logout endpoint (delete all sessions for a user)
- [ ] Session fixation protection (regenerate session ID on privilege escalation)
- [ ] Encrypt upload files at rest (consider AES-256-GCM)
- [ ] Add `Strict-Transport-Security` via Caddy (already handled by Caddy's HTTPS)
- [ ] Penetration test guest document access and org isolation

---

## Secrets Management

All secrets are passed via environment variables. Never committed to git.

| Variable | Purpose |
|----------|---------|
| `POSTGRES_PASSWORD` | Database password |
| `COOKIE_SECRET` | Signs/verifies session cookies |
| `SESSION_SECRET` | (alias for COOKIE_SECRET in some configs) |

Use at least 32 random bytes for each secret in production:

```bash
openssl rand -hex 32
```

---

## Audit Log

Immutable audit log records are created for:
- Login / Failed login / Logout
- Booking lifecycle (create, edit, check-in, checkout, cancel, no-show)
- Room status changes (maintenance, blocking, cleaning completion)
- Payment events (record, reversal, refund)
- Document view/upload
- Invoice creation / cancellation
- User and employee changes
- Settings changes

Logs include: organizationId, buildingId, userId, userRole, action, entityType,
entityId, previousValue, newValue, reason, ipAddress, sessionId, timestamp.

**Audit logs cannot be deleted or edited through the application.**
