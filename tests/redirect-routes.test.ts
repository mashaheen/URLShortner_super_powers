import { describe, expect, it } from "vitest";
import { hashIpAddress } from "../src/redirect-analytics.js";
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
    const app = buildServer({ logger: false, prisma, ipHashSecret: "test-secret" });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/abc123",
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36",
          referer: "https://Referrer.example/path",
          "x-forwarded-for": "203.0.113.10",
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
      expect(prisma.createdEvents).toEqual([
        expect.not.objectContaining({
          ipHash: hashIpAddress("203.0.113.10", "test-secret"),
        }),
      ]);
    } finally {
      await app.close();
    }
  });

  it("shows unavailable HTML for missing links", async () => {
    const prisma = createPrismaStub(null);
    const app = buildServer({ logger: false, prisma, ipHashSecret: "test-secret" });

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
    const app = buildServer({ logger: false, prisma, ipHashSecret: "test-secret" });

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
    const app = buildServer({ logger: false, prisma, ipHashSecret: "test-secret" });

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
    const app = buildServer({ logger: false, prisma, ipHashSecret: "test-secret" });

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

  it("redirects valid links when analytics creation fails", async () => {
    const prisma = createPrismaStub({
      id: "link-5",
      originalUrl: "https://example.com/fallback",
      shortCode: "fallback",
      isActive: true,
      expiresAt: null,
    });
    prisma.clickEvent.create = async () => {
      throw new Error("analytics unavailable");
    };
    const app = buildServer({ logger: false, prisma, ipHashSecret: "test-secret" });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/fallback",
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0 Safari/537.36" },
      });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe("https://example.com/fallback");
    } finally {
      await app.close();
    }
  });
});
