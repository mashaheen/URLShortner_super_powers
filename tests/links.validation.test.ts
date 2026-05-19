import { describe, expect, it } from "vitest";
import { validateCreateLinkInput } from "../src/links/validation.js";

describe("link creation validation", () => {
  it("accepts an http URL without optional fields", () => {
    expect(validateCreateLinkInput({ url: "http://example.com/path" })).toEqual({
      ok: true,
      value: { url: "http://example.com/path", alias: undefined, expiresAt: undefined },
    });
  });

  it("rejects unsupported URL schemes", () => {
    expect(validateCreateLinkInput({ url: "ftp://example.com/file" })).toEqual({
      ok: false,
      code: "INVALID_URL",
      message: "URL must use http or https.",
    });
  });

  it("rejects localhost and private destinations", () => {
    expect(validateCreateLinkInput({ url: "http://localhost:3000" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
    expect(validateCreateLinkInput({ url: "http://192.168.1.10" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
    expect(validateCreateLinkInput({ url: "http://service.internal" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
  });

  it("rejects private and local IPv6 destinations", () => {
    expect(validateCreateLinkInput({ url: "http://[::]" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
    expect(validateCreateLinkInput({ url: "http://[::1]" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
    expect(validateCreateLinkInput({ url: "http://[::127.0.0.1]" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
    expect(validateCreateLinkInput({ url: "http://[0:0:0:0:0:0:127.0.0.1]" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
    expect(validateCreateLinkInput({ url: "http://[::ffff:127.0.0.1]" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
    expect(validateCreateLinkInput({ url: "http://[fc00::1]" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
    expect(validateCreateLinkInput({ url: "http://[fe80::1]" })).toMatchObject({ ok: false, code: "BLOCKED_URL" });
  });

  it("accepts a URL-safe custom alias", () => {
    expect(validateCreateLinkInput({ url: "https://example.com", alias: "launch-2026" })).toMatchObject({
      ok: true,
      value: { alias: "launch-2026" },
    });
  });

  it("rejects unsafe and reserved aliases", () => {
    expect(validateCreateLinkInput({ url: "https://example.com", alias: "bad alias" })).toMatchObject({ ok: false, code: "INVALID_ALIAS" });
    expect(validateCreateLinkInput({ url: "https://example.com", alias: "api" })).toMatchObject({ ok: false, code: "RESERVED_ALIAS" });
  });

  it("rejects invalid expiration values", () => {
    expect(validateCreateLinkInput({ url: "https://example.com", expiresAt: "not-a-date" })).toMatchObject({ ok: false, code: "INVALID_EXPIRATION" });
    expect(validateCreateLinkInput({ url: "https://example.com", expiresAt: "2020-01-01T00:00:00.000Z" })).toMatchObject({ ok: false, code: "INVALID_EXPIRATION" });
    expect(validateCreateLinkInput({ url: "https://example.com", expiresAt: { valueOf: () => Date.now() + 60_000 } })).toMatchObject({ ok: false, code: "INVALID_EXPIRATION" });
  });

  it("accepts a valid future expiration", () => {
    const result = validateCreateLinkInput({ url: "https://example.com", expiresAt: new Date(Date.now() + 60_000).toISOString() });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.value.expiresAt).toBeInstanceOf(Date);
  });
});
