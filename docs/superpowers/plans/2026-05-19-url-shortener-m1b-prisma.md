# URL Shortener M1B Prisma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Prisma data model and Fastify database connection needed by later link, redirect, and admin milestones.

**Architecture:** Prisma owns PostgreSQL schema and generated database client. The Fastify app registers a small database plugin that decorates the app with a Prisma client, verifies connectivity during readiness checks, and disconnects during server shutdown.

**Tech Stack:** Node.js, TypeScript, Fastify, Prisma, PostgreSQL, Vitest.

---

## File Structure

- Create: `prisma/schema.prisma` defines `Link`, `ClickEvent`, `AdminUser`, and `AdminSession` models from the approved spec.
- Create: `src/db.ts` exports a `PrismaClient` factory and Fastify plugin.
- Create: `src/types/fastify.d.ts` adds the `app.prisma` decorator type.
- Modify: `src/server.ts` accepts an injectable database client for tests, registers the plugin, and expands `/health`.
- Modify: `tests/health.test.ts` verifies both healthy and unavailable database responses without needing a real PostgreSQL server.
- Modify: `package.json` and `package-lock.json` add Prisma dependencies and scripts.
- Modify: `docs/superpowers/plans/implementation-tracker.md` marks M1B complete and updates the current plan.

### Task 1: Prisma Schema And Dependencies

**Files:**
- Create: `prisma/schema.prisma`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install Prisma packages**

Run: `npm install @prisma/client && npm install --save-dev prisma`

Expected: `package.json` contains `@prisma/client` in dependencies and `prisma` in devDependencies.

- [ ] **Step 2: Add Prisma scripts**

Update `package.json` scripts to include:

```json
"db:generate": "prisma generate",
"db:migrate": "prisma migrate dev",
"db:studio": "prisma studio"
```

- [ ] **Step 3: Add schema**

Create `prisma/schema.prisma` with PostgreSQL provider, Prisma client generator, and four models matching the design spec. Use `@map` and `@@map` so database table/column names are snake_case while generated TypeScript uses camelCase.

- [ ] **Step 4: Generate Prisma client**

Run: `npm run db:generate`
Expected: Prisma Client generated successfully.

### Task 2: Database Plugin And Health Tests

**Files:**
- Create: `src/db.ts`
- Create: `src/types/fastify.d.ts`
- Modify: `src/server.ts`
- Modify: `tests/health.test.ts`

- [ ] **Step 1: Write failing tests**

Add health tests that inject a fake Prisma client with `$queryRaw` and `$disconnect`. Verify `/health` returns `{ status: "ok", database: "ok" }` when the query resolves and HTTP 503 with `{ status: "error", database: "unavailable" }` when it rejects.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/health.test.ts`
Expected: FAIL because `buildServer` does not accept a Prisma client and `/health` does not check the database.

- [ ] **Step 3: Implement plugin and server wiring**

Create `src/db.ts` with a Prisma client factory and a Fastify plugin that decorates `app.prisma` and disconnects on close. Update `buildServer` to accept `prisma?: Pick<PrismaClient, "$queryRaw" | "$disconnect">`, register the plugin, and update `/health` to run `SELECT 1`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/health.test.ts`
Expected: PASS.

### Task 3: Verification And Tracker

**Files:**
- Modify: `docs/superpowers/plans/implementation-tracker.md`

- [ ] **Step 1: Typecheck and build**

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Update tracker**

Mark M1B complete and set current plan to `docs/superpowers/plans/2026-05-19-url-shortener-m1b-prisma.md`.

## Self-Review

- Spec coverage: M1B covers the approved data model and database connection foundation only. Public link creation, redirects, admin auth, and analytics behavior remain in later milestones.
- Placeholder scan: No placeholder tasks remain.
- Type consistency: `app.prisma`, `$queryRaw`, `$disconnect`, and `buildServer({ prisma })` are used consistently across tasks.
