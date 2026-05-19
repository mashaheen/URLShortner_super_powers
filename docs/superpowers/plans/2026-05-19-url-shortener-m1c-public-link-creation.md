# URL Shortener M1C Public Link Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public anonymous short-link creation with URL validation, custom alias validation, random code generation, and uniqueness collision handling.

**Architecture:** Keep validation and generation logic in focused modules under `src/links/`, then expose the behavior through a small Fastify route registered from `buildServer`. The route uses the injectable Prisma-shaped database client so tests can exercise behavior without PostgreSQL.

**Tech Stack:** Node.js, TypeScript, Fastify, Prisma-shaped persistence, Vitest.

---

## File Structure

- Create: `src/links/validation.ts` validates destination URLs and optional aliases, including reserved aliases and private/internal hosts.
- Create: `src/links/code.ts` generates URL-safe random short codes.
- Create: `src/links/service.ts` creates links through the database client and retries generated-code collisions.
- Create: `src/links/routes.ts` registers `POST /api/links` and maps validation/service errors to stable JSON responses.
- Create: `tests/links.validation.test.ts` covers URL and alias validation.
- Create: `tests/links.service.test.ts` covers generated code, custom alias, collision retry, and collision exhaustion behavior.
- Create: `tests/links.routes.test.ts` covers public API success and validation errors.
- Modify: `src/db.ts` expands the testable database client type to include `link.create`.
- Modify: `src/server.ts` accepts `publicBaseUrl`, registers link routes, and keeps `/health` behavior unchanged.
- Modify: `docs/superpowers/plans/implementation-tracker.md` marks M1C complete and updates the current plan.

### Task 1: Validation And Code Generation

**Files:**
- Create: `src/links/validation.ts`
- Create: `src/links/code.ts`
- Create: `tests/links.validation.test.ts`

- [ ] **Step 1: Write failing validation tests**

Create `tests/links.validation.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { validateCreateLinkInput } from "../src/links/validation.js";

describe("link creation validation", () => {
  it("accepts an http URL without optional fields", () => {
    expect(validateCreateLinkInput({ url: "https://example.com/path" })).toEqual({
      ok: true,
      value: { url: "https://example.com/path", alias: undefined, expiresAt: undefined },
    });
  });

  it("rejects unsupported URL schemes", () => {
    expect(validateCreateLinkInput({ url: "ftp://example.com/file" })).toEqual({
      ok: false,
      code: "INVALID_URL",
      message: "URL must use http or https.",
    });
  });

  it("rejects localhost and private destinations", () => {
    expect(validateCreateLinkInput({ url: "http://localhost:3000" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
    expect(validateCreateLinkInput({ url: "http://192.168.1.10" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
    expect(validateCreateLinkInput({ url: "http://service.internal" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
  });

  it("accepts a URL-safe custom alias", () => {
    expect(validateCreateLinkInput({ url: "https://example.com", alias: "launch-2026" })).toMatchObject({
      ok: true,
      value: { alias: "launch-2026" },
    });
  });

  it("rejects unsafe and reserved aliases", () => {
    expect(validateCreateLinkInput({ url: "https://example.com", alias: "bad alias" })).toMatchObject({ ok: false, code: "INVALID_ALIAS" });
    expect(validateCreateLinkInput({ url: "https://example.com", alias: "api" })).toMatchObject({ ok: false, code: "RESERVED_ALIAS" });
  });

  it("rejects invalid expiration values", () => {
    expect(validateCreateLinkInput({ url: "https://example.com", expiresAt: "not-a-date" })).toMatchObject({ ok: false, code: "INVALID_EXPIRATION" });
    expect(validateCreateLinkInput({ url: "https://example.com", expiresAt: "2020-01-01T00:00:00.000Z" })).toMatchObject({ ok: false, code: "INVALID_EXPIRATION" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/links.validation.test.ts`

Expected: FAIL because `src/links/validation.ts` does not exist.

- [ ] **Step 3: Implement validation and code generation**

Create `src/links/validation.ts` with a discriminated validation result, reserved alias set (`api`, `admin`, `docs`, `health`, `assets`, `favicon.ico`), URL scheme checks, localhost/internal/private IPv4 blocking, alias regex `/^[A-Za-z0-9_-]{3,64}$/`, and future expiration parsing.

Create `src/links/code.ts` with `generateShortCode(length = 7): string` using Node `crypto.randomBytes`, URL-safe alphabet `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-`, and a minimum length guard.

- [ ] **Step 4: Run validation tests**

Run: `npm test -- tests/links.validation.test.ts`

Expected: PASS.

### Task 2: Link Creation Service

**Files:**
- Create: `src/links/service.ts`
- Create: `tests/links.service.test.ts`
- Modify: `src/db.ts`

- [ ] **Step 1: Write failing service tests**

Create `tests/links.service.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createLink, LinkCodeCollisionError } from "../src/links/service.js";

function createDatabaseStub(create: (args: unknown) => Promise<unknown>) {
  return {
    link: { create },
    $queryRaw: async () => [{ "?column?": 1 }],
    $disconnect: async () => {},
  };
}

describe("createLink", () => {
  it("creates a generated short link and returns the public short URL", async () => {
    const db = createDatabaseStub(async (args) => ({ id: "1", originalUrl: "https://example.com", shortCode: "abc123_", isCustomAlias: false, expiresAt: null }));

    const result = await createLink({ db, publicBaseUrl: "https://sho.rt", input: { url: "https://example.com" }, generateCode: () => "abc123_" });

    expect(result).toEqual({ id: "1", url: "https://example.com", shortCode: "abc123_", shortUrl: "https://sho.rt/abc123_", isCustomAlias: false, expiresAt: null });
  });

  it("creates a custom alias without replacing it", async () => {
    let createArgs: unknown;
    const db = createDatabaseStub(async (args) => {
      createArgs = args;
      return { id: "2", originalUrl: "https://example.com", shortCode: "launch", isCustomAlias: true, expiresAt: null };
    });

    await createLink({ db, publicBaseUrl: "https://sho.rt/", input: { url: "https://example.com", alias: "launch" }, generateCode: () => "unused" });

    expect(createArgs).toMatchObject({ data: { shortCode: "launch", isCustomAlias: true } });
  });

  it("retries generated code collisions", async () => {
    const attemptedCodes: string[] = [];
    const db = createDatabaseStub(async (args: any) => {
      attemptedCodes.push(args.data.shortCode);
      if (args.data.shortCode === "dupe") {
        const error = new Error("Unique constraint failed");
        (error as any).code = "P2002";
        throw error;
      }
      return { id: "3", originalUrl: "https://example.com", shortCode: args.data.shortCode, isCustomAlias: false, expiresAt: null };
    });

    const codes = ["dupe", "fresh"];
    const result = await createLink({ db, publicBaseUrl: "https://sho.rt", input: { url: "https://example.com" }, generateCode: () => codes.shift() ?? "fresh" });

    expect(attemptedCodes).toEqual(["dupe", "fresh"]);
    expect(result.shortCode).toBe("fresh");
  });

  it("does not retry custom alias collisions", async () => {
    const db = createDatabaseStub(async () => {
      const error = new Error("Unique constraint failed");
      (error as any).code = "P2002";
      throw error;
    });

    await expect(createLink({ db, publicBaseUrl: "https://sho.rt", input: { url: "https://example.com", alias: "launch" }, generateCode: () => "unused" })).rejects.toThrow(LinkCodeCollisionError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/links.service.test.ts`

Expected: FAIL because `src/links/service.ts` does not exist.

- [ ] **Step 3: Implement service and database type**

Update `src/db.ts` so `DatabaseClient` includes `link.create`. Create `src/links/service.ts` with `createLink`, `LinkCodeCollisionError`, generated-code retry up to 5 attempts, no retry for custom aliases, and short URL construction from `publicBaseUrl`.

- [ ] **Step 4: Run service tests**

Run: `npm test -- tests/links.service.test.ts`

Expected: PASS.

### Task 3: Public API Route And Tracker

**Files:**
- Create: `src/links/routes.ts`
- Create: `tests/links.routes.test.ts`
- Modify: `src/server.ts`
- Modify: `docs/superpowers/plans/implementation-tracker.md`

- [ ] **Step 1: Write failing route tests**

Create `tests/links.routes.test.ts` with tests that inject `buildServer({ logger: false, publicBaseUrl: "https://sho.rt", prisma: dbStub })`, post to `/api/links`, and verify: `201` success JSON includes `shortUrl`; invalid URL returns `400` with `INVALID_URL`; custom alias collision returns `409` with `ALIAS_UNAVAILABLE`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/links.routes.test.ts`

Expected: FAIL because the route is not registered.

- [ ] **Step 3: Implement route and server wiring**

Create `src/links/routes.ts` registering `POST /api/links`. Validate request body, call `createLink`, return HTTP 201 on success, HTTP 400 for validation failures, HTTP 409 for alias collisions, and HTTP 500 for generated-code collision exhaustion. Update `src/server.ts` to accept `publicBaseUrl?: string` and register the route after the database plugin.

- [ ] **Step 4: Run route tests**

Run: `npm test -- tests/links.routes.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

- [ ] **Step 6: Update tracker**

In `docs/superpowers/plans/implementation-tracker.md`, mark M1C complete and set current plan to `docs/superpowers/plans/2026-05-19-url-shortener-m1c-public-link-creation.md`.

## Self-Review

- Spec coverage: M1C implements public link creation validation, URL-safe generated codes, custom alias uniqueness behavior, collision retry behavior, and public short URL response construction. Rate limiting remains intentionally deferred because the tracker names M1C as validation and generation only.
- Placeholder scan: No placeholder tasks remain.
- Type consistency: `DatabaseClient`, `createLink`, `LinkCodeCollisionError`, `publicBaseUrl`, and validation error codes are used consistently across tasks.
