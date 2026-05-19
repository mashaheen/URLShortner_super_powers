# URL Shortener M1D Redirect Clicks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the public `GET /:code` redirect route with unavailable HTML responses and basic click counting for human-looking visits.

**Architecture:** Keep redirect behavior separate from health/API concerns by adding a small redirect route module and pure analytics helpers. The Fastify app continues to accept an injectable Prisma-like client so route behavior is testable without a live database.

**Tech Stack:** Fastify 5, TypeScript, Prisma client shape, Vitest API tests.

---

## File Structure

- Create `src/redirect-analytics.ts`: pure helpers for bot detection, referrer host normalization, coarse device type, browser summary, and keyed HMAC-SHA256 IP hashing.
- Create `src/redirect-routes.ts`: Fastify plugin that registers `GET /:code`, looks up links, renders unavailable HTML, redirects valid links, and records clicks without delaying the redirect path beyond awaited local Prisma calls in tests.
- Modify `src/db.ts`: extend the injectable `DatabaseClient` type with the minimal Prisma model methods required by redirect routes.
- Modify `src/server.ts`: register redirect routes after health route and before returning the app.
- Create `tests/redirect-analytics.test.ts`: unit coverage for analytics helper behavior.
- Create `tests/redirect-routes.test.ts`: API coverage for valid, missing, inactive, expired, and bot redirects.
- Modify `docs/superpowers/plans/implementation-tracker.md`: mark M1D complete and update current plan.

### Task 1: Analytics Helpers

**Files:**
- Create: `src/redirect-analytics.ts`
- Test: `tests/redirect-analytics.test.ts`

- [ ] **Step 1: Write failing helper tests**

```typescript
import { describe, expect, it } from "vitest";
import { detectBrowser, detectDeviceType, hashIpAddress, isBotUserAgent, normalizeReferrerHost } from "../src/redirect-analytics.js";

describe("redirect analytics helpers", () => {
  it("identifies obvious bot user agents", () => {
    expect(isBotUserAgent("Mozilla/5.0 Googlebot/2.1")).toBe(true);
    expect(isBotUserAgent("curl/8.0.1")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 Safari/605.1.15")).toBe(false);
  });

  it("normalizes valid referrer hosts and ignores invalid referrers", () => {
    expect(normalizeReferrerHost("https://Example.COM/path?q=1")).toBe("example.com");
    expect(normalizeReferrerHost("not a url")).toBeNull();
    expect(normalizeReferrerHost(undefined)).toBeNull();
  });

  it("detects coarse device types", () => {
    expect(detectDeviceType("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("mobile");
    expect(detectDeviceType("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
    expect(detectDeviceType("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    expect(detectDeviceType(undefined)).toBe("unknown");
  });

  it("detects coarse browser names", () => {
    expect(detectBrowser("Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36")).toBe("Chrome");
    expect(detectBrowser("Mozilla/5.0 Firefox/126.0")).toBe("Firefox");
    expect(detectBrowser(undefined)).toBeNull();
  });

  it("hashes IP addresses with a secret without returning the raw address", () => {
    const hash = hashIpAddress("203.0.113.10", "secret-a");
    const otherSecretHash = hashIpAddress("203.0.113.10", "secret-b");

    expect(hash).not.toBe("203.0.113.10");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(otherSecretHash).toMatch(/^[a-f0-9]{64}$/);
    expect(otherSecretHash).not.toBe(hash);
    expect(hashIpAddress(undefined, "secret-a")).toBeNull();
  });
});
```

- [ ] **Step 2: Run helper tests to verify RED**

Run: `npm test -- tests/redirect-analytics.test.ts`

Expected: FAIL because `src/redirect-analytics.ts` does not exist.

- [ ] **Step 3: Implement analytics helpers**

```typescript
import { createHmac } from "node:crypto";

export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

const botPattern = /bot|crawler|spider|slurp|curl|wget|headless|preview|facebookexternalhit|twitterbot|linkedinbot/i;

export function isBotUserAgent(userAgent: string | undefined): boolean {
  return botPattern.test(userAgent ?? "");
}

export function normalizeReferrerHost(referrer: string | undefined): string | null {
  if (!referrer) {
    return null;
  }

  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function detectDeviceType(userAgent: string | undefined): DeviceType {
  const value = userAgent ?? "";

  if (/ipad|tablet/i.test(value)) {
    return "tablet";
  }

  if (/mobile|iphone|android.*phone/i.test(value)) {
    return "mobile";
  }

  if (/windows|macintosh|linux|x11/i.test(value)) {
    return "desktop";
  }

  return "unknown";
}

export function detectBrowser(userAgent: string | undefined): string | null {
  const value = userAgent ?? "";

  if (/edg\//i.test(value)) {
    return "Edge";
  }

  if (/chrome\//i.test(value) && !/chromium/i.test(value)) {
    return "Chrome";
  }

  if (/firefox\//i.test(value)) {
    return "Firefox";
  }

  if (/safari\//i.test(value) && !/chrome\//i.test(value)) {
    return "Safari";
  }

  return null;
}

export function hashIpAddress(ipAddress: string | undefined, secret: string): string | null {
  if (!ipAddress) {
    return null;
  }

  return createHmac("sha256", secret).update(ipAddress).digest("hex");
}
```

- [ ] **Step 4: Run helper tests to verify GREEN**

Run: `npm test -- tests/redirect-analytics.test.ts`

Expected: PASS.

### Task 2: Redirect Route

**Files:**
- Create: `src/redirect-routes.ts`
- Modify: `src/db.ts`
- Modify: `src/server.ts`
- Test: `tests/redirect-routes.test.ts`

- [ ] **Step 1: Write failing route tests**

```typescript
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

type LinkRecord = {
  id: string;
  originalUrl: string;
  shortCode: string;
  isActive: boolean;
  expiresAt: Date | null;
};

function createPrismaStub(link: LinkRecord | null) {
  const createdEvents: unknown[] = [];
  let updatedLinkId: string | null = null;

  return {
    createdEvents,
    get updatedLinkId() {
      return updatedLinkId;
    },
    link: {
      findUnique: async ({ where }: { where: { shortCode: string } }) => (where.shortCode === link?.shortCode ? link : null),
      update: async ({ where }: { where: { id: string } }) => {
        updatedLinkId = where.id;
        return link;
      },
    },
    clickEvent: {
      create: async ({ data }: { data: unknown }) => {
        createdEvents.push(data);
        return data;
      },
    },
    $queryRaw: async () => [{ "?column?": 1 }],
    $disconnect: async () => {},
  };
}

describe("redirect route", () => {
  it("redirects active non-expired links and records a human click", async () => {
    const prisma = createPrismaStub({
      id: "link-1",
      originalUrl: "https://example.com/article",
      shortCode: "abc123",
      isActive: true,
      expiresAt: null,
    });
    const app = buildServer({ logger: false, prisma });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/abc123",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
          referer: "https://Referrer.example/path",
        },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe("https://example.com/article");
      expect(prisma.updatedLinkId).toBe("link-1");
      expect(prisma.createdEvents).toEqual([
        expect.objectContaining({
          linkId: "link-1",
          referrerHost: "referrer.example",
          deviceType: "desktop",
          browser: "Chrome",
        }),
      ]);
      expect(JSON.stringify(prisma.createdEvents[0])).not.toContain("203.0.113.10");
    } finally {
      await app.close();
    }
  });

  it("shows unavailable HTML for missing links", async () => {
    const prisma = createPrismaStub(null);
    const app = buildServer({ logger: false, prisma });

    try {
      const response = await app.inject({ method: "GET", url: "/missing" });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain("Short link unavailable");
    } finally {
      await app.close();
    }
  });

  it("shows unavailable HTML for inactive links", async () => {
    const prisma = createPrismaStub({
      id: "link-2",
      originalUrl: "https://example.com",
      shortCode: "inactive",
      isActive: false,
      expiresAt: null,
    });
    const app = buildServer({ logger: false, prisma });

    try {
      const response = await app.inject({ method: "GET", url: "/inactive" });

      expect(response.statusCode).toBe(410);
      expect(response.body).toContain("no longer active");
      expect(prisma.createdEvents).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("shows unavailable HTML for expired links", async () => {
    const prisma = createPrismaStub({
      id: "link-3",
      originalUrl: "https://example.com",
      shortCode: "expired",
      isActive: true,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    const app = buildServer({ logger: false, prisma });

    try {
      const response = await app.inject({ method: "GET", url: "/expired" });

      expect(response.statusCode).toBe(410);
      expect(response.body).toContain("expired");
      expect(prisma.createdEvents).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("redirects bots without counting clicks", async () => {
    const prisma = createPrismaStub({
      id: "link-4",
      originalUrl: "https://example.com/bot",
      shortCode: "botlink",
      isActive: true,
      expiresAt: null,
    });
    const app = buildServer({ logger: false, prisma });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/botlink",
        headers: { "user-agent": "Googlebot/2.1" },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe("https://example.com/bot");
      expect(prisma.createdEvents).toEqual([]);
      expect(prisma.updatedLinkId).toBeNull();
    } finally {
      await app.close();
    }
  });
});
```

- [ ] **Step 2: Run route tests to verify RED**

Run: `npm test -- tests/redirect-routes.test.ts`

Expected: FAIL because `GET /:code` is not registered.

- [ ] **Step 3: Extend database client type**

```typescript
export type DatabaseClient = {
  link: {
    findUnique: (args: { where: { shortCode: string } }) => Promise<{
      id: string;
      originalUrl: string;
      shortCode: string;
      isActive: boolean;
      expiresAt: Date | null;
    } | null>;
    update: (args: { where: { id: string }; data: { totalClickCount: { increment: number } } }) => Promise<unknown>;
  };
  clickEvent: {
    create: (args: {
      data: {
        linkId: string;
        referrerHost: string | null;
        deviceType: string;
        browser: string | null;
        ipHash: string | null;
      };
    }) => Promise<unknown>;
  };
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  $disconnect: () => Promise<void>;
};
```

- [ ] **Step 4: Implement redirect route plugin and register it**

```typescript
import type { FastifyPluginAsync } from "fastify";
import { detectBrowser, detectDeviceType, hashIpAddress, isBotUserAgent, normalizeReferrerHost } from "./redirect-analytics.js";

function unavailablePage(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Short link unavailable</title></head><body><main><h1>Short link unavailable</h1><p>${message}</p></main></body></html>`;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type RedirectRoutesOptions = {
  ipHashSecret: string;
};

export const redirectRoutes: FastifyPluginAsync<RedirectRoutesOptions> = async (app, options) => {
  app.get<{ Params: { code: string } }>("/:code", async (request, reply) => {
    const link = await app.prisma.link.findUnique({ where: { shortCode: request.params.code } });

    if (!link) {
      return reply.code(404).type("text/html").send(unavailablePage("We could not find that short link."));
    }

    if (!link.isActive) {
      return reply.code(410).type("text/html").send(unavailablePage("This short link is no longer active."));
    }

    if (link.expiresAt && link.expiresAt.getTime() <= Date.now()) {
      return reply.code(410).type("text/html").send(unavailablePage("This short link has expired."));
    }

    const userAgent = request.headers["user-agent"];

    if (!isBotUserAgent(userAgent)) {
      try {
        await app.prisma.clickEvent.create({
          data: {
            linkId: link.id,
            referrerHost: normalizeReferrerHost(firstHeaderValue(request.headers.referer)),
            deviceType: detectDeviceType(userAgent),
            browser: detectBrowser(userAgent),
            ipHash: hashIpAddress(request.ip, options.ipHashSecret),
          },
        });
        await app.prisma.link.update({ where: { id: link.id }, data: { totalClickCount: { increment: 1 } } });
      } catch (error) {
        request.log.warn({ error, linkId: link.id }, "failed to record redirect analytics");
      }
    }

    return reply.redirect(link.originalUrl);
  });
};
```

In `src/server.ts`, require `ipHashSecret` in `buildServer` options, add `import { redirectRoutes } from "./redirect-routes.js";`, and register with `app.register(redirectRoutes, { ipHashSecret: options.ipHashSecret });` after `/health` is declared. In `src/index.ts`, read `IP_HASH_SECRET` from the environment, trim it, require at least 32 characters, and pass it to `buildServer`.

- [ ] **Step 5: Run route tests to verify GREEN**

Run: `npm test -- tests/redirect-routes.test.ts`

Expected: PASS.

### Task 3: Tracker And Full Verification

**Files:**
- Modify: `docs/superpowers/plans/implementation-tracker.md`

- [ ] **Step 1: Update tracker**

Set M1D checked and set current plan to `docs/superpowers/plans/2026-05-19-url-shortener-m1d-redirect-clicks.md`.

- [ ] **Step 2: Run full verification**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

---

## Self-Review

- Spec coverage: Implements redirect lookup, active/expiration checks, unavailable HTML, valid redirect, human click event creation, denormalized count increment, and bot exclusion from counting.
- Out of scope: Public link creation remains outside this M1D plan because this worktree starts from committed `main`, where M1C is not present.
- Placeholder scan: No placeholders remain.
- Type consistency: `DatabaseClient` method names match `redirect-routes.ts` and test stubs.
