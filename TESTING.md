# Motel CMB 53 — Testing Guide

## Unit Tests (no database required)

The backend unit tests cover all pure business logic: pricing calculations,
overlap detection, status transition rules, RBAC permission levels, and
payment validation.

```bash
cd backend
npm test
```

Expected output: **97 tests passing** across two test files.

### Test coverage

| File | Tests | Coverage |
|------|-------|----------|
| `pricing.test.ts` | 26 | Non-AC pricing, AC pricing, multi-night, surcharge double-counting, fixed/pct discount, service charge, additional charges, outstanding balance |
| `booking-validation.test.ts` | 71 | Overlap detection (9 scenarios), room status transitions, bookability, capacity, RBAC roles, check-in document validation, payment validation, night count |

---

## Integration Tests (requires PostgreSQL)

Integration tests need a dedicated test database. **Never run against production.**

### Setup

```bash
# 1. Create a separate test database
createdb motelcmb53_test

# 2. Set the test DATABASE_URL
export TEST_DATABASE_URL="postgresql://postgres:password@localhost:5432/motelcmb53_test"

# 3. Run migrations against the test database
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy

# 4. Seed the test database
DATABASE_URL=$TEST_DATABASE_URL npx tsx prisma/seed.ts
```

### Running integration tests

```bash
cd backend
DATABASE_URL=$TEST_DATABASE_URL npm test
```

---

## Manual Test Checklist

Use this checklist after each deployment to verify critical workflows:

### Authentication
- [ ] Login with valid credentials succeeds
- [ ] Login with wrong password fails (rate limited after 20 attempts)
- [ ] Logout clears the session cookie
- [ ] Expired session redirects to login

### Booking workflow
- [ ] Create reservation (Reserved status)
- [ ] Upload NIC front image before check-in
- [ ] Check-in fails without identity document
- [ ] Check-in fails with PENDING document number
- [ ] Check-in succeeds with valid document + image
- [ ] Room moves to Occupied on check-in
- [ ] Checkout creates invoice record
- [ ] Room moves to Cleaning on checkout
- [ ] Mark cleaning complete moves room to Vacant

### Room status
- [ ] Occupied room cannot be manually set to Vacant
- [ ] Occupied room cannot be manually set to Maintenance
- [ ] Vacant → Maintenance requires a reason
- [ ] Cleaning → Vacant allowed (cleaning complete)

### Payments
- [ ] Payment within outstanding balance succeeds
- [ ] Payment exceeding outstanding balance is rejected
- [ ] Refund within total paid succeeds
- [ ] Refund exceeding total paid is rejected
- [ ] Payment reference format: PAY-CMB53-000001

### RBAC
- [ ] Cashier cannot create a booking
- [ ] Operator cannot process a refund
- [ ] Operator cannot override room rate
- [ ] ReadOnly user cannot modify any record
- [ ] User cannot access another organization's guests

### Documents
- [ ] JPEG upload accepted
- [ ] PNG upload accepted
- [ ] WebP upload accepted
- [ ] PDF upload rejected (identity docs are images only)
- [ ] Renamed executable rejected (signature mismatch)
- [ ] Document view creates audit log
- [ ] Guest from another organization's document is inaccessible

---

## Known gaps requiring future integration tests

These scenarios require a test database and are not yet covered by automated tests:

1. Two simultaneous overlapping bookings — only one succeeds (concurrency)
2. Check-in updates booking and room atomically (transaction rollback)
3. Checkout creates stored invoice record
4. Payment reference cannot collide (PaymentSequence atomicity)
5. Audit log created on document view/download
6. Settings affect booking defaults (check-in/out time, AC surcharge)
7. Building Manager cannot access another building
