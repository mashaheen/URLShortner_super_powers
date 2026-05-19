# M2C Admin Analytics API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated admin analytics APIs for overview cards and chart breakdowns by day, referrer, and device.

**Architecture:** Keep analytics aggregation in `src/admin/routes.ts` beside the existing admin API, using small helper functions for date parsing, Prisma capability checks, and response serialization. Tests extend `tests/admin-routes.test.ts` with an in-memory database stub that records aggregate calls and verifies response shape.

**Tech Stack:** Fastify, TypeScript, Prisma-style client, Vitest.

---

## File Structure

- Modify: `src/db.ts` to add typed optional `clickEvent.groupBy`, `clickEvent.count`, and `link.count` argument shapes used by admin analytics.
- Modify: `src/admin/routes.ts` to register `GET /api/admin/analytics/overview`, `GET /api/admin/analytics/clicks-by-day`, `GET /api/admin/analytics/referrers`, and `GET /api/admin/analytics/devices`.
- Modify: `tests/admin-routes.test.ts` to add analytics fixtures, database stub methods, and route coverage.
- Modify: `docs/superpowers/plans/implementation-tracker.md` to mark M2C complete and update the current plan.

## Task 1: Admin Analytics Endpoints

**Files:**
- Modify: `tests/admin-routes.test.ts`
- Modify: `src/db.ts`
- Modify: `src/admin/routes.ts`
- Modify: `docs/superpowers/plans/implementation-tracker.md`

- [ ] **Step 1: Write failing route tests**

Add tests under `describe("admin analytics routes", () => { ... })` in `tests/admin-routes.test.ts` for:

```ts
it("requires an authenticated admin session for analytics overview", async () => {
  const app = buildServer({ ...serverDefaults, prisma: createDbStub() });

  try {
    const response = await app.inject({ method: "GET", url: "/api/admin/analytics/overview" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Admin session is required." });
  } finally {
    await app.close();
  }
});

it("returns overview card totals for authenticated admins", async () => {
  const prisma = createDbStub({ passwordHash: await hash("correct-password") });
  const app = buildServer({ ...serverDefaults, prisma });
  const token = "browser-token";
  await prisma.adminSession.create({
    data: {
      adminUserId: "admin_1",
      sessionTokenHash: hashSessionToken(token, serverDefaults.sessionSecret),
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
    },
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/analytics/overview",
      headers: { cookie: `admin_session=${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      overview: { totalLinks: 2, totalClicks: 15, activeLinks: 1, recentClicks: 3 },
    });
  } finally {
    await app.close();
  }
});

it("returns clicks grouped by day for the requested range", async () => {
  const prisma = createDbStub({ passwordHash: await hash("correct-password") });
  const app = buildServer({ ...serverDefaults, prisma });
  const token = "browser-token";
  await prisma.adminSession.create({
    data: {
      adminUserId: "admin_1",
      sessionTokenHash: hashSessionToken(token, serverDefaults.sessionSecret),
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
    },
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/analytics/clicks-by-day?from=2026-05-18T00:00:00.000Z&to=2026-05-20T00:00:00.000Z",
      headers: { cookie: `admin_session=${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      days: [
        { date: "2026-05-18", clicks: 2 },
        { date: "2026-05-19", clicks: 1 },
      ],
    });
    expect(prisma.calls.clickGroupBy[0]).toMatchObject({ by: ["clickedAt"], where: { clickedAt: { gte: new Date("2026-05-18T00:00:00.000Z"), lte: new Date("2026-05-20T00:00:00.000Z") } } });
  } finally {
    await app.close();
  }
});

it("returns referrer and device analytics breakdowns", async () => {
  const prisma = createDbStub({ passwordHash: await hash("correct-password") });
  const app = buildServer({ ...serverDefaults, prisma });
  const token = "browser-token";
  await prisma.adminSession.create({
    data: {
      adminUserId: "admin_1",
      sessionTokenHash: hashSessionToken(token, serverDefaults.sessionSecret),
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
    },
  });

  try {
    const referrers = await app.inject({
      method: "GET",
      url: "/api/admin/analytics/referrers?limit=2",
      headers: { cookie: `admin_session=${token}` },
    });
    const devices = await app.inject({
      method: "GET",
      url: "/api/admin/analytics/devices",
      headers: { cookie: `admin_session=${token}` },
    });

    expect(referrers.statusCode).toBe(200);
    expect(referrers.json()).toEqual({ referrers: [{ referrer: "example.com", clicks: 2 }, { referrer: "Direct", clicks: 1 }] });
    expect(devices.statusCode).toBe(200);
    expect(devices.json()).toEqual({ devices: [{ deviceType: "desktop", clicks: 2 }, { deviceType: "mobile", clicks: 1 }] });
  } finally {
    await app.close();
  }
});

it("rejects invalid analytics date ranges", async () => {
  const prisma = createDbStub({ passwordHash: await hash("correct-password") });
  const app = buildServer({ ...serverDefaults, prisma });
  const token = "browser-token";
  await prisma.adminSession.create({
    data: {
      adminUserId: "admin_1",
      sessionTokenHash: hashSessionToken(token, serverDefaults.sessionSecret),
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
    },
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/analytics/clicks-by-day?from=not-a-date",
      headers: { cookie: `admin_session=${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: "VALIDATION_ERROR", message: "Invalid analytics request." });
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/admin-routes.test.ts`

Expected: FAIL with 404s for missing `/api/admin/analytics/*` routes or type errors for missing stub analytics capabilities.

- [ ] **Step 3: Implement minimal analytics routes**

Add the smallest production code to support the tests:

- `GET /api/admin/analytics/overview` returns total links, active links, sum of `totalClickCount`, and click events from the last 24 hours.
- `GET /api/admin/analytics/clicks-by-day` accepts optional `from` and `to`, validates ISO dates, groups click events by day, and returns `{ days: [{ date, clicks }] }` sorted ascending.
- `GET /api/admin/analytics/referrers` accepts optional positive `limit` capped at 25, groups by `referrerHost`, maps `null` to `Direct`, and returns `{ referrers: [{ referrer, clicks }] }`.
- `GET /api/admin/analytics/devices` groups by `deviceType` and returns `{ devices: [{ deviceType, clicks }] }`.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `npm test -- tests/admin-routes.test.ts`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Update tracker**

Update `docs/superpowers/plans/implementation-tracker.md`:

```md
- [x] M2C: Admin analytics API
...
- Current plan: `docs/superpowers/plans/2026-05-19-url-shortener-m2c-admin-analytics-api.md`
```

- [ ] **Step 7: Commit**

Run:

```bash
git add src/db.ts src/admin/routes.ts tests/admin-routes.test.ts docs/superpowers/plans/implementation-tracker.md docs/superpowers/plans/2026-05-19-url-shortener-m2c-admin-analytics-api.md
git commit -m "feat: add admin analytics API"
```

Expected: commit succeeds.

## Self-Review

- Spec coverage: Implements authenticated analytics endpoints for overview cards and chart data by day, referrer, and device from the Admin API section.
- Placeholder scan: No placeholders remain.
- Type consistency: Route names, response property names, and database method names match the task steps.
