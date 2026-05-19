import { describe, expect, it } from "vitest";
import { hash } from "argon2";
import {
  createAdminSession,
  createSessionToken,
  findAdminBySessionToken,
  hashSessionToken,
  verifyAdminCredentials,
} from "../src/admin/auth.js";
import type { DatabaseClient } from "../src/db.js";

const now = new Date("2026-05-19T00:00:00.000Z");

function createDbStub(overrides: Partial<DatabaseClient> = {}): DatabaseClient {
  return {
    link: {
      create: async () => {
        throw new Error("unused");
      },
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
      create: async () => ({ id: "session_1", expiresAt: now }),
      findUnique: async () => null,
      deleteMany: async () => ({ count: 0 }),
    },
    $queryRaw: async () => [],
    $disconnect: async () => {},
    ...overrides,
  };
}

describe("admin auth service", () => {
  it("creates high entropy session tokens and stable hashes", () => {
    const token = createSessionToken();

    expect(token).toHaveLength(64);
    expect(hashSessionToken(token, "session-secret")).toBe(hashSessionToken(token, "session-secret"));
    expect(hashSessionToken(token, "session-secret")).not.toBe(token);
  });

  it("rejects missing admin credentials", async () => {
    const result = await verifyAdminCredentials({
      db: createDbStub(),
      email: "admin@example.com",
      password: "password",
    });

    expect(result).toBeNull();
  });

  it("verifies valid admin credentials with a normalized email", async () => {
    const result = await verifyAdminCredentials({
      db: createDbStub({
        adminUser: {
          findUnique: async ({ where }) => ({
            id: "admin_1",
            email: where.email,
            passwordHash: await hash("correct-password"),
          }),
          update: async () => ({}),
        },
      }),
      email: " Admin@Example.COM ",
      password: "correct-password",
    });

    expect(result).toEqual({ id: "admin_1", email: "admin@example.com" });
  });

  it("creates a session using only a hashed token and updates last login", async () => {
    let sessionData: { adminUserId: string; sessionTokenHash: string; expiresAt: Date } | undefined;
    let lastLoginAt: Date | undefined;

    const result = await createAdminSession({
      db: createDbStub({
        adminUser: {
          findUnique: async () => null,
          update: async ({ data }) => {
            lastLoginAt = data.lastLoginAt;
            return {};
          },
        },
        adminSession: {
          create: async ({ data }) => {
            sessionData = data;
            return { id: "session_1", expiresAt: data.expiresAt };
          },
          findUnique: async () => null,
          deleteMany: async () => ({ count: 0 }),
        },
      }),
      adminUserId: "admin_1",
      sessionSecret: "session-secret",
      now,
    });

    expect(result.token).toHaveLength(64);
    expect(sessionData).toEqual({
      adminUserId: "admin_1",
      sessionTokenHash: hashSessionToken(result.token, "session-secret"),
      expiresAt: new Date("2026-05-26T00:00:00.000Z"),
    });
    expect(sessionData?.sessionTokenHash).not.toBe(result.token);
    expect(lastLoginAt).toEqual(now);
  });

  it("returns the admin for a valid unexpired session token", async () => {
    const result = await findAdminBySessionToken({
      db: createDbStub({
        adminSession: {
          create: async () => ({ id: "session_1", expiresAt: now }),
          deleteMany: async () => ({ count: 0 }),
          findUnique: async () => ({
            expiresAt: new Date("2026-05-20T00:00:00.000Z"),
            adminUser: { id: "admin_1", email: "admin@example.com" },
          }),
        },
      }),
      token: "token",
      sessionSecret: "session-secret",
      now,
    });

    expect(result).toEqual({ id: "admin_1", email: "admin@example.com" });
  });

  it("rejects and deletes expired session tokens", async () => {
    let deletedHash: string | undefined;

    const result = await findAdminBySessionToken({
      db: createDbStub({
        adminSession: {
          create: async () => ({ id: "session_1", expiresAt: now }),
          deleteMany: async ({ where }) => {
            deletedHash = where.sessionTokenHash;
            return { count: 1 };
          },
          findUnique: async () => ({
            expiresAt: new Date("2026-05-18T00:00:00.000Z"),
            adminUser: { id: "admin_1", email: "admin@example.com" },
          }),
        },
      }),
      token: "token",
      sessionSecret: "session-secret",
      now,
    });

    expect(result).toBeNull();
    expect(deletedHash).toBe(hashSessionToken("token", "session-secret"));
  });
});
