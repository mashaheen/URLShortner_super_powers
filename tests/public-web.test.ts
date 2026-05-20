import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import type { DatabaseClient } from "../src/db.js";

function createDbStub(): DatabaseClient {
  return {
    link: {
      create: async () => ({
        id: "link_1",
        originalUrl: "https://example.com",
        shortCode: "abc123_",
        isCustomAlias: false,
        expiresAt: null,
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
    $queryRaw: async () => [],
    $disconnect: async () => {},
  };
}

const serverDefaults = {
  logger: false,
  ipHashSecret: "test-secret",
  sessionSecret: "test-session-secret",
};

describe("public web routes", () => {
  it("serves the public React shell at root from the web root", async () => {
    const webRoot = await mkdtemp(join(tmpdir(), "public-web-"));
    const shell = "<!doctype html><div id=\"root\">React shell</div>";
    await writeFile(join(webRoot, "index.html"), shell);

    const app = buildServer({ ...serverDefaults, prisma: createDbStub(), webRoot });

    try {
      const response = await app.inject({ method: "GET", url: "/" });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toBe(shell);
    } finally {
      await app.close();
    }
  });

  it("keeps API routes ahead of the public web shell", async () => {
    const webRoot = await mkdtemp(join(tmpdir(), "public-web-"));
    await mkdir(join(webRoot, "api"));
    await writeFile(join(webRoot, "index.html"), "<!doctype html><div id=\"root\">React shell</div>");
    await writeFile(join(webRoot, "api", "links"), "static API file");

    const app = buildServer({ ...serverDefaults, prisma: createDbStub(), webRoot });

    try {
      const response = await app.inject({ method: "GET", url: "/api/links" });

      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).not.toContain("text/html");
      expect(response.body).not.toContain("React shell");
      expect(response.body).not.toContain("static API file");
    } finally {
      await app.close();
    }
  });

  it("does not serve dotfiles from the web root", async () => {
    const webRoot = await mkdtemp(join(tmpdir(), "public-web-"));
    await writeFile(join(webRoot, "index.html"), "<!doctype html><div id=\"root\">React shell</div>");
    await writeFile(join(webRoot, ".env"), "SECRET=leaked");

    const app = buildServer({ ...serverDefaults, prisma: createDbStub(), webRoot });

    try {
      const response = await app.inject({ method: "GET", url: "/.env" });

      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain("SECRET=leaked");
    } finally {
      await app.close();
    }
  });
});
