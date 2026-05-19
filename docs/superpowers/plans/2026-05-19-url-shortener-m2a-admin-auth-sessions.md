# M2A Admin Auth Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cookie-based admin login, logout, and current-admin session endpoints.

**Architecture:** Reuse the existing Fastify plugin pattern and Prisma client decoration. Add a focused admin auth service for password verification, token hashing, session creation, and session lookup, then register `/api/admin/session` routes from `buildServer`.

**Tech Stack:** Fastify, TypeScript, Prisma, Vitest, Node crypto, Argon2.

---

## File Structure

- Modify: `package.json` to add Argon2 runtime dependency.
- Modify: `src/config.ts` to read session secret and cookie secure settings.
- Modify: `src/db.ts` to include the `adminUser` and `adminSession` Prisma surfaces used by tests and routes.
- Create: `src/admin/auth.ts` for authentication/session logic and cookie constants.
- Create: `src/admin/routes.ts` for `/api/admin/session` login/logout/current-admin endpoints.
- Modify: `src/server.ts` to accept session config and register admin routes before redirects.
- Create: `tests/admin-auth.test.ts` for service-level token/session behavior.
- Create: `tests/admin-routes.test.ts` for API and cookie behavior.
- Modify: `docs/superpowers/plans/implementation-tracker.md` to mark M2A complete after verification.

### Task 1: Admin Auth Service

**Files:**
- Create: `src/admin/auth.ts`
- Modify: `src/db.ts`
- Test: `tests/admin-auth.test.ts`

- [ ] **Step 1: Write failing service tests**

```ts
import { describe, expect, it } from "vitest";
import { createSessionToken, hashSessionToken, verifyAdminCredentials, findAdminBySessionToken } from "../src/admin/auth.js";
import type { DatabaseClient } from "../src/db.js";

const now = new Date("2026-05-19T00:00:00.000Z");

function createDbStub(overrides: Partial<DatabaseClient> = {}): DatabaseClient {
  return {
    link: { create: async () => { throw new Error("unused"); }, findUnique: async () => null, update: async () => ({}) },
    clickEvent: { create: async () => ({}) },
    adminUser: { findUnique: async () => null, update: async () => ({}) },
    adminSession: { create: async () => ({ id: "session_1", expiresAt: now }), findUnique: async () => null, deleteMany: async () => ({ count: 0 }) },
    $queryRaw: async () => [],
    $disconnect: async () => {},
    ...overrides,
  };
}

describe("admin auth service", () => {
  it("creates high entropy session tokens and stable hashes", () => {
    const token = createSessionToken();

    expect(token).toHaveLength(64);
    expect(hashSessionToken(token, "session-secret")).toBe(hashSessionToken(token, "session-secret"));
    expect(hashSessionToken(token, "session-secret")).not.toBe(token);
  });

  it("rejects missing admin credentials", async () => {
    const result = await verifyAdminCredentials({ db: createDbStub(), email: "admin@example.com", password: "password" });

    expect(result).toBeNull();
  });

  it("returns the admin for a valid unexpired session token", async () => {
    const result = await findAdminBySessionToken({
      db: createDbStub({
        adminSession: {
          create: async () => ({ id: "session_1", expiresAt: now }),
          deleteMany: async () => ({ count: 0 }),
          findUnique: async () => ({
            expiresAt: new Date("2026-05-20T00:00:00.000Z"),
            adminUser: { id: "admin_1", email: "admin@example.com" },
          }),
        },
      }),
      token: "token",
      sessionSecret: "session-secret",
      now,
    });

    expect(result).toEqual({ id: "admin_1", email: "admin@example.com" });
  });
});
```

- [ ] **Step 2: Run service tests to verify red**

Run: `npm test -- tests/admin-auth.test.ts`
Expected: FAIL because `src/admin/auth.ts` does not exist.

- [ ] **Step 3: Implement the minimal service**

Add `adminUser` and `adminSession` types to `DatabaseClient`, then create `src/admin/auth.ts` with token creation, HMAC SHA-256 token hashing, Argon2 password verification, session creation, current-admin lookup, and session deletion helpers.

- [ ] **Step 4: Run service tests to verify green**

Run: `npm test -- tests/admin-auth.test.ts`
Expected: PASS.

### Task 2: Admin Session Routes

**Files:**
- Create: `src/admin/routes.ts`
- Modify: `src/server.ts`
- Modify: `src/config.ts`
- Test: `tests/admin-routes.test.ts`

- [ ] **Step 1: Write failing route tests**

Test login returns `204` and an `HttpOnly; SameSite=Lax` cookie, current admin returns `401` without a cookie and admin JSON with one, logout deletes the server-side session and clears the cookie, and invalid credentials return `{ code: "INVALID_CREDENTIALS" }` with `401`.

- [ ] **Step 2: Run route tests to verify red**

Run: `npm test -- tests/admin-routes.test.ts`
Expected: FAIL because admin routes are not registered.

- [ ] **Step 3: Implement routes and config**

Add `readSessionSecret` and `readCookieSecure` in `src/config.ts`. Add `adminAuthRoutes` with `POST /api/admin/session`, `GET /api/admin/session`, and `DELETE /api/admin/session`. Register routes from `buildServer` with `sessionSecret` and `cookieSecure` options.

- [ ] **Step 4: Run route tests to verify green**

Run: `npm test -- tests/admin-routes.test.ts`
Expected: PASS.

### Task 3: Verification And Tracker

**Files:**
- Modify: `docs/superpowers/plans/implementation-tracker.md`

- [ ] **Step 1: Run full verification**

Run: `npm test`
Expected: all tests pass.

Run: `npm run typecheck`
Expected: TypeScript passes.

Run: `npm run build`
Expected: production build passes.

- [ ] **Step 2: Update tracker**

Set M2A to complete and update `Current plan` to `docs/superpowers/plans/2026-05-19-url-shortener-m2a-admin-auth-sessions.md`.

- [ ] **Step 3: Commit**

Commit message: `feat: add admin session authentication`.
