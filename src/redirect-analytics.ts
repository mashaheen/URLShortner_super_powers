import { createHmac } from "node:crypto";

export type DeviceType = "desktop" | "mobile" | "tablet" | "unknown";

const botPattern = /bot|crawler|spider|slurp|curl|wget|headless|preview|facebookexternalhit|twitterbot|linkedinbot/i;

export function isBotUserAgent(userAgent: string | undefined): boolean {
  return botPattern.test(userAgent ?? "");
}

export function normalizeReferrerHost(referrer: string | undefined): string | null {
  if (!referrer) {
    return null;
  }

  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function detectDeviceType(userAgent: string | undefined): DeviceType {
  const value = userAgent ?? "";

  if (/ipad|tablet/i.test(value)) {
    return "tablet";
  }

  if (/mobile|iphone|android.*phone/i.test(value)) {
    return "mobile";
  }

  if (/windows|macintosh|linux|x11/i.test(value)) {
    return "desktop";
  }

  return "unknown";
}

export function detectBrowser(userAgent: string | undefined): string | null {
  const value = userAgent ?? "";

  if (/edg\//i.test(value)) {
    return "Edge";
  }

  if (/chrome\//i.test(value) && !/chromium/i.test(value)) {
    return "Chrome";
  }

  if (/firefox\//i.test(value)) {
    return "Firefox";
  }

  if (/safari\//i.test(value) && !/chrome\//i.test(value)) {
    return "Safari";
  }

  return null;
}

export function hashIpAddress(ipAddress: string | undefined, secret: string): string | null {
  if (!ipAddress) {
    return null;
  }

  return createHmac("sha256", secret).update(ipAddress).digest("hex");
}
