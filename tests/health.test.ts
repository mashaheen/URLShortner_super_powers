import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";

function createPrismaStub(queryRaw: () => Promise<unknown>) {
  return {
    link: {
      create: async () => ({
        id: "1",
        originalUrl: "https://example.com",
        shortCode: "abc123_",
        isCustomAlias: false,
        expiresAt: null,
        createdAt: new Date("2026-05-20T10:00:00.000Z"),
      }),
      findUnique: async () => null,
      update: async () => ({}),
    },
    clickEvent: {
      create: async () => ({}),
    },
    adminUser: {
      findUnique: async () => null,
      update: async () => ({}),
    },
    adminSession: {
      create: async () => ({ id: "session_1", expiresAt: new Date() }),
      findUnique: async () => null,
      deleteMany: async () => ({ count: 0 }),
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
      sessionSecret: "test-session-secret",
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
      sessionSecret: "test-session-secret",
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

describe("OpenAPI docs", () => {
  it("exposes the OpenAPI document", async () => {
    const app = buildServer({
      logger: false,
      prisma: createPrismaStub(async () => [{ "?column?": 1 }]),
      ipHashSecret: "test-secret",
      sessionSecret: "test-session-secret",
    });

    try {
      const response = await app.inject({ method: "GET", url: "/docs/json" });
      const document = response.json();

      expect(response.statusCode).toBe(200);
      expect(document).toMatchObject({
        openapi: expect.stringMatching(/^3\./),
        info: { title: "URL Shortener API", version: "1.0.0" },
      });
      expect(document.paths["/api/links"].post.summary).toBe("Create short link");
    } finally {
      await app.close();
    }
  });

  it("serves the Swagger UI", async () => {
    const app = buildServer({
      logger: false,
      prisma: createPrismaStub(async () => [{ "?column?": 1 }]),
      ipHashSecret: "test-secret",
      sessionSecret: "test-session-secret",
    });

    try {
      const response = await app.inject({ method: "GET", url: "/docs" });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
    } finally {
      await app.close();
    }
  });
});
