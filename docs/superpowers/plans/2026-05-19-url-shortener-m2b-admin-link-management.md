# M2B Admin Link Management API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated admin APIs for listing, searching, filtering, updating, deactivating, and deleting short links.

**Architecture:** Keep M2B within the existing Fastify admin route plugin so session authentication is shared with current admin session endpoints. Validate request input at the route boundary, use Prisma link queries directly, and return stable JSON errors for unauthenticated and invalid admin requests.

**Tech Stack:** Fastify, TypeScript, Prisma, Vitest.

---

## File Structure

- Modify `src/admin/routes.ts`: add reusable admin session guard and link management endpoints under `/api/admin/links`.
- Modify `tests/admin-routes.test.ts`: extend the DB stub and add API tests for auth, list/search/filter/pagination, update/deactivate, validation, not-found, and delete behavior.
- Modify `docs/superpowers/plans/implementation-tracker.md`: mark M2B complete and point current plan at this file.

### Task 1: Admin Link Route Tests

**Files:**
- Modify: `tests/admin-routes.test.ts`

- [ ] **Step 1: Add failing tests**

Add tests showing:
- `GET /api/admin/links` requires a valid admin session.
- `GET /api/admin/links?q=docs&status=active&page=2&pageSize=1` returns paginated link data and passes search/filter options to the DB.
- `PATCH /api/admin/links/:id` updates `originalUrl`, `isActive`, and nullable `expiresAt`.
- `POST /api/admin/links/:id/deactivate` sets `isActive` to false.
- `DELETE /api/admin/links/:id` returns `204`.
- invalid update input returns `{ code: "VALIDATION_ERROR", message: "Invalid admin link request." }`.
- missing links return `{ code: "NOT_FOUND", message: "Link not found." }`.

- [ ] **Step 2: Verify tests fail**

Run: `npm test -- tests/admin-routes.test.ts`

Expected: FAIL with `404`/missing endpoint assertions before production code exists.

### Task 2: Admin Link Routes

**Files:**
- Modify: `src/admin/routes.ts`

- [ ] **Step 1: Implement authenticated routes**

Add a local `requireAdmin` helper that reads the existing cookie, validates the session with `findAdminBySessionToken`, clears invalid cookies, and returns `401` with the existing `UNAUTHENTICATED` JSON shape when missing or invalid.

- [ ] **Step 2: Implement `GET /api/admin/links`**

Support `q`, `status`, `page`, and `pageSize`. Default to page `1`, page size `20`, cap page size at `100`, order by newest first, and return `{ links, pagination }`.

- [ ] **Step 3: Implement mutations**

Add `PATCH /api/admin/links/:id`, `POST /api/admin/links/:id/deactivate`, and `DELETE /api/admin/links/:id`. Validate update fields, return `404` for Prisma not-found errors, and return `204` for delete.

- [ ] **Step 4: Verify tests pass**

Run: `npm test -- tests/admin-routes.test.ts`

Expected: PASS.

### Task 3: Tracker And Full Verification

**Files:**
- Modify: `docs/superpowers/plans/implementation-tracker.md`

- [ ] **Step 1: Update tracker**

Set M2B to complete and update the current plan path to this plan.

- [ ] **Step 2: Run full verification**

Run: `npm test`, `npm run typecheck`, and `npm run build`.

Expected: all commands pass.
