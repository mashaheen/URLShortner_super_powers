import { hash } from "argon2";
import { describe, expect, it } from "vitest";
import { hashSessionToken } from "../src/admin/auth.js";
import type { DatabaseClient } from "../src/db.js";
import { buildServer } from "../src/server.js";

function createDbStub(options: { passwordHash?: string } = {}): DatabaseClient & { sessionTokenHash: string | null } {
  let sessionTokenHash: string | null = null;

  return {
    get sessionTokenHash() {
      return sessionTokenHash;
    },
    link: {
      create: async () => ({ id: "1", originalUrl: "https://example.com", shortCode: "abc123_", isCustomAlias: false, expiresAt: null }),
      findUnique: async () => null,
      update: async () => ({}),
    },
    clickEvent: {
      create: async () => ({}),
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
    $queryRaw: async () => [],
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
