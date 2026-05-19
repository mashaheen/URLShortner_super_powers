import { describe, expect, it } from "vitest";
import { readIpHashSecret } from "../src/config.js";

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
});
