import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

function createPrismaStub(queryRaw: () => Promise<unknown>) {
  return {
    link: {
      create: async () => ({ id: "1", originalUrl: "https://example.com", shortCode: "abc123_", isCustomAlias: false, expiresAt: null }),
      findUnique: async () => null,
      update: async () => ({}),
    },
    clickEvent: {
      create: async () => ({}),
    },
    $queryRaw: queryRaw,
    $disconnect: async () => {},
  };
}

describe("health endpoint", () => {
  it("returns ok status when the database is reachable", async () => {
    const app = buildServer({
      logger: false,
      prisma: createPrismaStub(async () => [{ "?column?": 1 }]),
      ipHashSecret: "test-secret",
    });

    try {
      const response = await app.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok", database: "ok" });
    } finally {
      await app.close();
    }
  });

  it("returns unavailable status when the database cannot be reached", async () => {
    const app = buildServer({
      logger: false,
      prisma: createPrismaStub(async () => {
        throw new Error("database unavailable");
      }),
      ipHashSecret: "test-secret",
    });

    try {
      const response = await app.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: "error", database: "unavailable" });
    } finally {
      await app.close();
    }
  });
});
