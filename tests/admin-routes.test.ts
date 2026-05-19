import { hash } from "argon2";
import { describe, expect, it } from "vitest";
import { hashSessionToken } from "../src/admin/auth.js";
import type { DatabaseClient } from "../src/db.js";
import { buildServer } from "../src/server.js";

const linkOne = {
  id: "link_1",
  originalUrl: "https://example.com/docs",
  shortCode: "docs",
  isCustomAlias: true,
  isActive: true,
  expiresAt: null,
  totalClickCount: 12,
  createdAt: new Date("2026-05-18T10:00:00.000Z"),
  updatedAt: new Date("2026-05-18T11:00:00.000Z"),
};

const linkTwo = {
  id: "link_2",
  originalUrl: "https://example.com/blog",
  shortCode: "blog",
  isCustomAlias: false,
  isActive: false,
  expiresAt: new Date("2026-06-01T00:00:00.000Z"),
  totalClickCount: 3,
  createdAt: new Date("2026-05-17T10:00:00.000Z"),
  updatedAt: new Date("2026-05-17T11:00:00.000Z"),
};

function createDbStub(options: { passwordHash?: string } = {}): DatabaseClient & {
  sessionTokenHash: string | null;
    calls: { findMany: unknown[]; count: unknown[]; update: unknown[]; delete: unknown[]; aggregate: unknown[]; groupBy: unknown[]; clickCount: unknown[]; queryRaw: unknown[] };
} {
  let sessionTokenHash: string | null = null;
  const links = [{ ...linkOne }, { ...linkTwo }];
  const calls = {
    findMany: [] as unknown[],
    count: [] as unknown[],
    update: [] as unknown[],
    delete: [] as unknown[],
    aggregate: [] as unknown[],
    groupBy: [] as unknown[],
    clickCount: [] as unknown[],
    queryRaw: [] as unknown[],
  };
  const filterLinks = (where: Parameters<NonNullable<DatabaseClient["link"]["findMany"]>>[0]["where"]) => {
    let result = links;

    if (where.isActive !== undefined) {
      result = result.filter((link) => link.isActive === where.isActive);
    }

    const search = where.OR?.find((condition) => "shortCode" in condition)?.shortCode.contains;
    if (search) {
      const normalizedSearch = search.toLowerCase();
      result = result.filter(
        (link) => link.shortCode.toLowerCase().includes(normalizedSearch) || link.originalUrl.toLowerCase().includes(normalizedSearch),
      );
    }

    return result;
  };

  return {
    get sessionTokenHash() {
      return sessionTokenHash;
    },
    calls,
    link: {
      create: async () => ({ id: "1", originalUrl: "https://example.com", shortCode: "abc123_", isCustomAlias: false, expiresAt: null }),
      findUnique: async () => null,
      findMany: async (args) => {
        calls.findMany.push(args);
        const result = filterLinks(args.where);
        return result.slice(args.skip, args.skip + args.take);
      },
      count: async (args) => {
        calls.count.push(args);
        return filterLinks(args.where).length;
      },
      aggregate: async (args) => {
        calls.aggregate.push(args);
        return { _sum: { totalClickCount: links.reduce((total, link) => total + link.totalClickCount, 0) } };
      },
      update: async (args) => {
        calls.update.push(args);
        const link = links.find((candidate) => candidate.id === args.where.id);

        if (!link) {
          throw Object.assign(new Error("Record not found"), { code: "P2025" });
        }

        Object.assign(link, args.data, { updatedAt: new Date("2026-05-19T12:00:00.000Z") });
        return link;
      },
      delete: async (args) => {
        calls.delete.push(args);
        const index = links.findIndex((candidate) => candidate.id === args.where.id);

        if (index === -1) {
          throw Object.assign(new Error("Record not found"), { code: "P2025" });
        }

        return links.splice(index, 1)[0];
      },
    },
    clickEvent: {
      create: async () => ({}),
      count: async (args) => {
        calls.clickCount.push(args);
        return 3;
      },
      groupBy: async (args) => {
        calls.groupBy.push(args);

        if (args.by[0] === "referrerHost") {
          const rows = [
            { referrerHost: "zeta.example", _count: { _all: 2 } },
            { referrerHost: "alpha.example", _count: { _all: 2 } },
            { referrerHost: null, _count: { _all: 1 } },
          ];
          return typeof args.take === "number" ? rows.slice(0, args.take) : rows;
        }

        const rows = [
          { deviceType: "mobile", _count: { _all: 1 } },
          { deviceType: "desktop", _count: { _all: 2 } },
          { deviceType: "bot", _count: { _all: 2 } },
        ];
        return typeof args.take === "number" ? rows.slice(0, args.take) : rows;
      },
    },
    adminUser: {
      findUnique: async ({ where }) => {
        if (where.email !== "admin@example.com" || !options.passwordHash) {
          return null;
        }

        return { id: "admin_1", email: "admin@example.com", passwordHash: options.passwordHash };
      },
      update: async () => ({}),
    },
    adminSession: {
      create: async ({ data }) => {
        sessionTokenHash = data.sessionTokenHash;
        return { id: "session_1", expiresAt: data.expiresAt };
      },
      findUnique: async ({ where }) => {
        if (where.sessionTokenHash !== sessionTokenHash) {
          return null;
        }

        return {
          expiresAt: new Date("2999-01-01T00:00:00.000Z"),
          adminUser: { id: "admin_1", email: "admin@example.com" },
        };
      },
      deleteMany: async ({ where }) => {
        if (where.sessionTokenHash === sessionTokenHash) {
          sessionTokenHash = null;
          return { count: 1 };
        }

        return { count: 0 };
      },
    },
    $queryRaw: async (query, ...values) => {
      calls.queryRaw.push({ query: [...query], values });
      if (query.some((part) => part.includes("referrer_host"))) {
        return [{ referrer: null, clicks: 2n }, { referrer: "alpha.example", clicks: 2 }];
      }

      return [{ date: new Date("2026-05-18T00:00:00.000Z"), clicks: 2n }, { date: "2026-05-19", clicks: 1 }];
    },
    $disconnect: async () => {},
  };
}

const serverDefaults = {
  logger: false,
  ipHashSecret: "test-ip-secret",
  sessionSecret: "test-session-secret",
  cookieSecure: false,
};

describe("admin session routes", () => {
  it("logs in an admin and sets an HttpOnly SameSite cookie", async () => {
    const prisma = createDbStub({ passwordHash: await hash("correct-password") });
    const app = buildServer({ ...serverDefaults, prisma });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/session",
        payload: { email: "admin@example.com", password: "correct-password" },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["set-cookie"]).toEqual(expect.stringContaining("admin_session="));
      expect(response.headers["set-cookie"]).toEqual(expect.stringContaining("HttpOnly"));
      expect(response.headers["set-cookie"]).toEqual(expect.stringContaining("SameSite=Lax"));
      expect(response.headers["set-cookie"]).not.toEqual(expect.stringContaining("Secure"));
      expect(prisma.sessionTokenHash).toEqual(expect.any(String));
    } finally {
      await app.close();
    }
  });

  it("sets Secure on the session cookie when cookie secure is enabled", async () => {
    const app = buildServer({
      ...serverDefaults,
      cookieSecure: true,
      prisma: createDbStub({ passwordHash: await hash("correct-password") }),
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/session",
        payload: { email: "admin@example.com", password: "correct-password" },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers["set-cookie"]).toEqual(expect.stringContaining("Secure"));
    } finally {
      await app.close();
    }
  });

  it("returns invalid credentials without setting a cookie", async () => {
    const app = buildServer({ ...serverDefaults, prisma: createDbStub({ passwordHash: await hash("correct-password") }) });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/session",
        payload: { email: "admin@example.com", password: "wrong-password" },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ code: "INVALID_CREDENTIALS", message: "Invalid email or password." });
      expect(response.headers["set-cookie"]).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it("returns the current admin for a valid session cookie", async () => {
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
        url: "/api/admin/session",
        headers: { cookie: `admin_session=${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ admin: { id: "admin_1", email: "admin@example.com" } });
    } finally {
      await app.close();
    }
  });

  it("returns unauthorized when no session cookie is present", async () => {
    const app = buildServer({ ...serverDefaults, prisma: createDbStub() });

    try {
      const response = await app.inject({ method: "GET", url: "/api/admin/session" });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Admin session is required." });
    } finally {
      await app.close();
    }
  });

  it("returns unauthorized and clears invalid session cookies", async () => {
    const app = buildServer({ ...serverDefaults, prisma: createDbStub() });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/session",
        headers: { cookie: "admin_session=unknown-token" },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Admin session is required." });
      expect(response.headers["set-cookie"]).toEqual(expect.stringContaining("Max-Age=0"));
    } finally {
      await app.close();
    }
  });

  it("treats malformed session cookies as unauthenticated", async () => {
    const app = buildServer({ ...serverDefaults, prisma: createDbStub() });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/session",
        headers: { cookie: "admin_session=%" },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Admin session is required." });
    } finally {
      await app.close();
    }
  });

  it("logs out by deleting the session and clearing the cookie", async () => {
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
        method: "DELETE",
        url: "/api/admin/session",
        headers: { cookie: `admin_session=${token}` },
      });

      expect(response.statusCode).toBe(204);
      expect(prisma.sessionTokenHash).toBeNull();
      expect(response.headers["set-cookie"]).toEqual(expect.stringContaining("admin_session="));
      expect(response.headers["set-cookie"]).toEqual(expect.stringContaining("Max-Age=0"));
    } finally {
      await app.close();
    }
  });
});

describe("admin link management routes", () => {
  it("requires an authenticated admin session to list links", async () => {
    const app = buildServer({ ...serverDefaults, prisma: createDbStub() });

    try {
      const response = await app.inject({ method: "GET", url: "/api/admin/links" });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Admin session is required." });
    } finally {
      await app.close();
    }
  });

  it("lists links with search, active filter, and pagination", async () => {
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
        url: "/api/admin/links?q=docs&status=active&page=2&pageSize=1",
        headers: { cookie: `admin_session=${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        links: [],
        pagination: { page: 2, pageSize: 1, totalItems: 1, totalPages: 1 },
      });
      expect(prisma.calls.findMany).toEqual([
        {
          where: {
            isActive: true,
            OR: [{ shortCode: { contains: "docs", mode: "insensitive" } }, { originalUrl: { contains: "docs", mode: "insensitive" } }],
          },
          orderBy: { createdAt: "desc" },
          skip: 1,
          take: 1,
        },
      ]);
      expect(prisma.calls.count).toEqual([
        {
          where: {
            isActive: true,
            OR: [{ shortCode: { contains: "docs", mode: "insensitive" } }, { originalUrl: { contains: "docs", mode: "insensitive" } }],
          },
        },
      ]);
    } finally {
      await app.close();
    }
  });

  it("updates a link original URL, active status, and expiration", async () => {
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
        method: "PATCH",
        url: "/api/admin/links/link_1",
        headers: { cookie: `admin_session=${token}` },
        payload: { originalUrl: "https://updated.example.com", isActive: false, expiresAt: null },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        link: {
          id: "link_1",
          originalUrl: "https://updated.example.com/",
          isActive: false,
          expiresAt: null,
        },
      });
      expect(prisma.calls.update).toEqual([
        {
          where: { id: "link_1" },
          data: { originalUrl: "https://updated.example.com/", isActive: false, expiresAt: null },
        },
      ]);
    } finally {
      await app.close();
    }
  });

  it("rejects invalid link update input", async () => {
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
        method: "PATCH",
        url: "/api/admin/links/link_1",
        headers: { cookie: `admin_session=${token}` },
        payload: { originalUrl: "ftp://example.com" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ code: "VALIDATION_ERROR", message: "Invalid admin link request." });
      expect(prisma.calls.update).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("rejects primitive link update bodies", async () => {
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
        method: "PATCH",
        url: "/api/admin/links/link_1",
        headers: { cookie: `admin_session=${token}`, "content-type": "application/json" },
        payload: JSON.stringify("not-an-object"),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ code: "VALIDATION_ERROR", message: "Invalid admin link request." });
      expect(prisma.calls.update).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("rejects blocked destinations in link updates", async () => {
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
        method: "PATCH",
        url: "/api/admin/links/link_1",
        headers: { cookie: `admin_session=${token}` },
        payload: { originalUrl: "http://localhost:3000/private" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ code: "VALIDATION_ERROR", message: "Invalid admin link request." });
      expect(prisma.calls.update).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("returns not found when updating a missing link", async () => {
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
        method: "PATCH",
        url: "/api/admin/links/missing",
        headers: { cookie: `admin_session=${token}` },
        payload: { isActive: true },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ code: "NOT_FOUND", message: "Link not found." });
    } finally {
      await app.close();
    }
  });

  it("deactivates a link", async () => {
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
        method: "POST",
        url: "/api/admin/links/link_1/deactivate",
        headers: { cookie: `admin_session=${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ link: { id: "link_1", isActive: false } });
      expect(prisma.calls.update).toEqual([{ where: { id: "link_1" }, data: { isActive: false } }]);
    } finally {
      await app.close();
    }
  });

  it("deletes a link", async () => {
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
        method: "DELETE",
        url: "/api/admin/links/link_1",
        headers: { cookie: `admin_session=${token}` },
      });

      expect(response.statusCode).toBe(204);
      expect(prisma.calls.delete).toEqual([{ where: { id: "link_1" } }]);
    } finally {
      await app.close();
    }
  });
});

describe("admin analytics routes", () => {
  async function authenticatedApp() {
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

    return { app, prisma, token };
  }

  it("requires an authenticated admin session for overview analytics", async () => {
    const app = buildServer({ ...serverDefaults, prisma: createDbStub() });

    try {
      const response = await app.inject({ method: "GET", url: "/api/admin/analytics/overview" });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ code: "UNAUTHENTICATED", message: "Admin session is required." });
    } finally {
      await app.close();
    }
  });

  it("returns overview analytics for an authenticated admin", async () => {
    const { app, prisma, token } = await authenticatedApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/analytics/overview",
        headers: { cookie: `admin_session=${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ overview: { totalLinks: 2, totalClicks: 15, activeLinks: 1, recentClicks: 3 } });
      expect(prisma.calls.aggregate).toEqual([{ _sum: { totalClickCount: true } }]);
      expect(prisma.calls.findMany).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("returns clicks grouped by day for an authenticated admin", async () => {
    const { app, prisma, token } = await authenticatedApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/analytics/clicks-by-day?from=2026-05-18T00:00:00.000Z&to=2026-05-20T00:00:00.000Z",
        headers: { cookie: `admin_session=${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ days: [{ date: "2026-05-18", clicks: 2 }, { date: "2026-05-19", clicks: 1 }] });
      expect(prisma.calls.groupBy).toEqual([]);
      expect(prisma.calls.queryRaw).toHaveLength(1);
      expect(prisma.calls.queryRaw[0]).toMatchObject({ values: [new Date("2026-05-18T00:00:00.000Z"), new Date("2026-05-20T00:00:00.000Z")] });
    } finally {
      await app.close();
    }
  });

  it("returns referrer analytics for an authenticated admin", async () => {
    const { app, prisma, token } = await authenticatedApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/analytics/referrers?limit=2",
        headers: { cookie: `admin_session=${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        referrers: [{ referrer: "Direct", clicks: 2 }, { referrer: "alpha.example", clicks: 2 }],
      });
      expect(prisma.calls.groupBy).toEqual([]);
      expect(prisma.calls.queryRaw).toHaveLength(1);
      expect(prisma.calls.queryRaw[0]).toMatchObject({ values: [2] });
    } finally {
      await app.close();
    }
  });

  it("returns device analytics for an authenticated admin", async () => {
    const { app, prisma, token } = await authenticatedApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/analytics/devices",
        headers: { cookie: `admin_session=${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ devices: [{ deviceType: "bot", clicks: 2 }, { deviceType: "desktop", clicks: 2 }, { deviceType: "mobile", clicks: 1 }] });
      expect(prisma.calls.groupBy).toEqual([
        { by: ["deviceType"], _count: { _all: true }, orderBy: [{ _count: { deviceType: "desc" } }, { deviceType: "asc" }], take: 25 },
      ]);
    } finally {
      await app.close();
    }
  });

  it("rejects invalid clicks-by-day date ranges", async () => {
    const { app, token } = await authenticatedApp();

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/admin/analytics/clicks-by-day?from=2026-05-20T00:00:00.000Z&to=2026-05-18T00:00:00.000Z",
        headers: { cookie: `admin_session=${token}` },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ code: "VALIDATION_ERROR", message: "Invalid analytics request." });
    } finally {
      await app.close();
    }
  });
});
