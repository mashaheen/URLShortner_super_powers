import { describe, expect, it } from "vitest";
import { detectBrowser, detectDeviceType, hashIpAddress, isBotUserAgent, normalizeReferrerHost } from "../src/redirect-analytics.js";

describe("redirect analytics helpers", () => {
  it("identifies obvious bot user agents", () => {
    expect(isBotUserAgent("Mozilla/5.0 Googlebot/2.1")).toBe(true);
    expect(isBotUserAgent("curl/8.0.1")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 Safari/605.1.15")).toBe(false);
  });

  it("normalizes valid referrer hosts and ignores invalid referrers", () => {
    expect(normalizeReferrerHost("https://Example.COM/path?q=1")).toBe("example.com");
    expect(normalizeReferrerHost("not a url")).toBeNull();
    expect(normalizeReferrerHost(undefined)).toBeNull();
  });

  it("detects coarse device types", () => {
    expect(detectDeviceType("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("mobile");
    expect(detectDeviceType("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablet");
    expect(detectDeviceType("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("desktop");
    expect(detectDeviceType(undefined)).toBe("unknown");
  });

  it("detects coarse browser names", () => {
    expect(detectBrowser("Mozilla/5.0 Chrome/124.0.0.0 Safari/537.36")).toBe("Chrome");
    expect(detectBrowser("Mozilla/5.0 Firefox/126.0")).toBe("Firefox");
    expect(detectBrowser(undefined)).toBeNull();
  });

  it("hashes IP addresses with a keyed secret", () => {
    const firstHash = hashIpAddress("203.0.113.10", "secret-a");
    const secondHash = hashIpAddress("203.0.113.10", "secret-b");

    expect(firstHash).not.toBe("203.0.113.10");
    expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
    expect(secondHash).toMatch(/^[a-f0-9]{64}$/);
    expect(firstHash).not.toBe(secondHash);
    expect(hashIpAddress(undefined, "secret-a")).toBeNull();
  });
});
