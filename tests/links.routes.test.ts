import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import type { DatabaseClient, LinkCreateResult } from "../src/db.js";

function createDbStub(create: DatabaseClient["link"]["create"]): DatabaseClient {
  return {
    link: { create },
    $queryRaw: async () => [],
    $disconnect: async () => {},
  };
}

function uniqueConstraintError(): Error & { code: string } {
  const error = new Error("Unique constraint failed") as Error & { code: string };
  error.code = "P2002";
  return error;
}

describe("link routes", () => {
  it("creates a public short link", async () => {
    const app = buildServer({
      logger: false,
      publicBaseUrl: "https://sho.rt",
      prisma: createDbStub(async (): Promise<LinkCreateResult> => ({
        id: "link_1",
        originalUrl: "https://example.com",
        shortCode: "abc123_",
        isCustomAlias: false,
        expiresAt: null,
      })),
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/links",
        payload: { url: "https://example.com" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        id: "link_1",
        url: "https://example.com",
        shortCode: "abc123_",
        shortUrl: "https://sho.rt/abc123_",
        isCustomAlias: false,
        expiresAt: null,
      });
    } finally {
      await app.close();
    }
  });

  it("returns a validation error for unsupported URL protocols", async () => {
    const app = buildServer({
      logger: false,
      publicBaseUrl: "https://sho.rt",
      prisma: createDbStub(async () => {
        throw new Error("link.create should not be called");
      }),
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/links",
        payload: { url: "ftp://example.com/file" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "INVALID_URL", message: "URL must use http or https." });
    } finally {
      await app.close();
    }
  });

  it("returns a validation error when the request has no body", async () => {
    const app = buildServer({
      logger: false,
      publicBaseUrl: "https://sho.rt",
      prisma: createDbStub(async () => {
        throw new Error("link.create should not be called");
      }),
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/links",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "INVALID_URL", message: "URL must use http or https." });
    } finally {
      await app.close();
    }
  });

  it("returns a validation error when the request body is null", async () => {
    const app = buildServer({
      logger: false,
      publicBaseUrl: "https://sho.rt",
      prisma: createDbStub(async () => {
        throw new Error("link.create should not be called");
      }),
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/links",
        payload: "null",
        headers: { "content-type": "application/json" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "INVALID_URL", message: "URL must use http or https." });
    } finally {
      await app.close();
    }
  });

  it("returns a conflict when a custom alias is unavailable", async () => {
    const app = buildServer({
      logger: false,
      publicBaseUrl: "https://sho.rt",
      prisma: createDbStub(async () => {
        throw uniqueConstraintError();
      }),
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/links",
        payload: { url: "https://example.com", alias: "launch" },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: "ALIAS_UNAVAILABLE", message: "Alias is already in use." });
    } finally {
      await app.close();
    }
  });
});
