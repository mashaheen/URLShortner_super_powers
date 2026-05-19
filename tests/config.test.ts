import { describe, expect, it } from "vitest";
import { readCookieSecure, readIpHashSecret, readSessionSecret } from "../src/config.js";

describe("config", () => {
  it("reads IP hash secret from the environment", () => {
    expect(readIpHashSecret({ IP_HASH_SECRET: "abcdefghijklmnopqrstuvwxyz123456" })).toBe("abcdefghijklmnopqrstuvwxyz123456");
  });

  it("fails fast when IP hash secret is missing", () => {
    expect(() => readIpHashSecret({})).toThrow(/IP_HASH_SECRET/);
  });

  it("fails fast when IP hash secret is whitespace only", () => {
    expect(() => readIpHashSecret({ IP_HASH_SECRET: "   " })).toThrow(/IP_HASH_SECRET/);
  });

  it("fails fast when IP hash secret is too short", () => {
    expect(() => readIpHashSecret({ IP_HASH_SECRET: "short-secret" })).toThrow(/IP_HASH_SECRET/);
  });

  it("trims IP hash secret after validating length", () => {
    expect(readIpHashSecret({ IP_HASH_SECRET: "  abcdefghijklmnopqrstuvwxyz123456  " })).toBe("abcdefghijklmnopqrstuvwxyz123456");
  });

  it("reads session secret from the environment", () => {
    expect(readSessionSecret({ SESSION_SECRET: "abcdefghijklmnopqrstuvwxyz123456" })).toBe("abcdefghijklmnopqrstuvwxyz123456");
  });

  it("fails fast when session secret is too short", () => {
    expect(() => readSessionSecret({ SESSION_SECRET: "short-secret" })).toThrow(/SESSION_SECRET/);
  });

  it("fails fast when session secret is missing", () => {
    expect(() => readSessionSecret({})).toThrow(/SESSION_SECRET/);
  });

  it("fails fast when session secret is whitespace only", () => {
    expect(() => readSessionSecret({ SESSION_SECRET: "   " })).toThrow(/SESSION_SECRET/);
  });

  it("enables secure cookies in production by default", () => {
    expect(readCookieSecure({ NODE_ENV: "production" })).toBe(true);
  });

  it("allows explicit secure cookie configuration outside production", () => {
    expect(readCookieSecure({ COOKIE_SECURE: "true", NODE_ENV: "development" })).toBe(true);
    expect(readCookieSecure({ COOKIE_SECURE: "false", NODE_ENV: "production" })).toBe(false);
  });
});
