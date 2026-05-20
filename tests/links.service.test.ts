import { describe, expect, it } from "vitest";
import { createLink, LinkCodeCollisionError } from "../src/links/service.js";
import type { DatabaseClient, LinkCreateResult } from "../src/db.js";

function createDbStub(create: (args: { data: { originalUrl: string; shortCode: string; isCustomAlias: boolean; expiresAt: Date | null } }) => Promise<LinkCreateResult>): DatabaseClient {
  return {
    link: {
      create,
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

function uniqueConstraintError(): Error & { code: string } {
  const error = new Error("Unique constraint failed") as Error & { code: string };
  error.code = "P2002";
  return error;
}

describe("link creation service", () => {
  it("creates a public short link from a generated code", async () => {
    const db = createDbStub(async () => ({
      id: "1",
      originalUrl: "https://example.com",
      shortCode: "abc123_",
      isCustomAlias: false,
      expiresAt: null,
      createdAt: new Date("2026-05-20T10:00:00.000Z"),
    }));

    await expect(
      createLink({
        db,
        publicBaseUrl: "https://sho.rt",
        input: { url: "https://example.com" },
        generateCode: () => "abc123_",
      }),
    ).resolves.toEqual({
      id: "1",
      url: "https://example.com",
      originalUrl: "https://example.com",
      shortCode: "abc123_",
      shortUrl: "https://sho.rt/abc123_",
      isCustomAlias: false,
      expiresAt: null,
      createdAt: new Date("2026-05-20T10:00:00.000Z"),
    });
  });

  it("uses a custom alias and handles a trailing public base URL slash", async () => {
    let createData: { originalUrl: string; shortCode: string; isCustomAlias: boolean; expiresAt: Date | null } | undefined;
    const db = createDbStub(async (args) => {
      createData = args.data;
      return {
        id: "1",
        originalUrl: args.data.originalUrl,
        shortCode: args.data.shortCode,
        isCustomAlias: args.data.isCustomAlias,
        expiresAt: args.data.expiresAt,
        createdAt: new Date("2026-05-20T10:00:00.000Z"),
      };
    });

    const result = await createLink({
      db,
      publicBaseUrl: "https://sho.rt/",
      input: { url: "https://example.com", alias: "launch" },
      generateCode: () => "unused",
    });

    expect(createData).toMatchObject({ shortCode: "launch", isCustomAlias: true });
    expect(result.shortUrl).toBe("https://sho.rt/launch");
  });

  it("retries generated code collisions", async () => {
    const generatedCodes = ["dupe", "fresh"];
    const createAttempts: string[] = [];
    const db = createDbStub(async (args) => {
      createAttempts.push(args.data.shortCode);
      if (args.data.shortCode === "dupe") {
        throw uniqueConstraintError();
      }

      return {
        id: "1",
        originalUrl: args.data.originalUrl,
        shortCode: args.data.shortCode,
        isCustomAlias: args.data.isCustomAlias,
        expiresAt: args.data.expiresAt,
        createdAt: new Date("2026-05-20T10:00:00.000Z"),
      };
    });

    const result = await createLink({
      db,
      publicBaseUrl: "https://sho.rt",
      input: { url: "https://example.com" },
      generateCode: () => generatedCodes.shift() ?? "unexpected",
    });

    expect(createAttempts).toEqual(["dupe", "fresh"]);
    expect(result.shortCode).toBe("fresh");
  });

  it("rejects custom alias collisions without retrying", async () => {
    let attempts = 0;
    const db = createDbStub(async () => {
      attempts += 1;
      throw uniqueConstraintError();
    });

    await expect(
      createLink({
        db,
        publicBaseUrl: "https://sho.rt",
        input: { url: "https://example.com", alias: "launch" },
        generateCode: () => "unused",
      }),
    ).rejects.toBeInstanceOf(LinkCodeCollisionError);
    expect(attempts).toBe(1);
  });

  it("rejects generated code collisions after 5 attempts", async () => {
    let attempts = 0;
    const db = createDbStub(async () => {
      attempts += 1;
      throw uniqueConstraintError();
    });

    await expect(
      createLink({
        db,
        publicBaseUrl: "https://sho.rt",
        input: { url: "https://example.com" },
        generateCode: () => `dupe-${attempts}`,
      }),
    ).rejects.toBeInstanceOf(LinkCodeCollisionError);
    expect(attempts).toBe(5);
  });
});
