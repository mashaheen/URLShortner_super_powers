export type CreateLinkInput = {
  url?: unknown;
  alias?: unknown;
  expiresAt?: unknown;
};

export type CreateLinkValue = {
  url: string;
  alias: string | undefined;
  expiresAt: Date | undefined;
};

export type CreateLinkValidationErrorCode =
  | "INVALID_URL"
  | "BLOCKED_URL"
  | "INVALID_ALIAS"
  | "RESERVED_ALIAS"
  | "INVALID_EXPIRATION";

export type CreateLinkValidationResult =
  | { ok: true; value: CreateLinkValue }
  | { ok: false; code: CreateLinkValidationErrorCode; message: string };

const RESERVED_ALIASES = new Set(["api", "admin", "docs", "health", "assets", "favicon.ico"]);
const ALIAS_PATTERN = /^[A-Za-z0-9_-]{3,64}$/;

export function validateCreateLinkInput(input: unknown): CreateLinkValidationResult {
  if (typeof input !== "object" || input === null) {
    return invalidUrl();
  }

  const linkInput = input as CreateLinkInput;

  if (typeof linkInput.url !== "string") {
    return invalidUrl();
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(linkInput.url);
  } catch {
    return invalidUrl();
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return invalidUrl();
  }

  if (isBlockedHostname(parsedUrl.hostname)) {
    return { ok: false, code: "BLOCKED_URL", message: "URL destination is not allowed." };
  }

  let alias: string | undefined;
  if (linkInput.alias !== undefined) {
    if (typeof linkInput.alias !== "string" || !ALIAS_PATTERN.test(linkInput.alias)) {
      return { ok: false, code: "INVALID_ALIAS", message: "Alias must be 3-64 URL-safe characters." };
    }

    if (RESERVED_ALIASES.has(linkInput.alias.toLowerCase())) {
      return { ok: false, code: "RESERVED_ALIAS", message: "Alias is reserved." };
    }

    alias = linkInput.alias;
  }

  let expiresAt: Date | undefined;
  if (linkInput.expiresAt !== undefined) {
    if (!(typeof linkInput.expiresAt === "string" || typeof linkInput.expiresAt === "number" || linkInput.expiresAt instanceof Date)) {
      return { ok: false, code: "INVALID_EXPIRATION", message: "Expiration must be a valid future date." };
    }

    expiresAt = new Date(linkInput.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return { ok: false, code: "INVALID_EXPIRATION", message: "Expiration must be a valid future date." };
    }
  }

  return { ok: true, value: { url: linkInput.url, alias, expiresAt } };
}

function invalidUrl(): CreateLinkValidationResult {
  return { ok: false, code: "INVALID_URL", message: "URL must use http or https." };
}

function isBlockedHostname(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[(.*)]$/, "$1");

  if (
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname === "internal" ||
    normalizedHostname.endsWith(".internal")
  ) {
    return true;
  }

  if (isBlockedIpv6(normalizedHostname)) {
    return true;
  }

  return isBlockedIpv4(normalizedHostname);
}

function isBlockedIpv6(hostname: string): boolean {
  if (!hostname.includes(":")) {
    return false;
  }

  if (hostname === "::" || hostname === "0:0:0:0:0:0:0:0" || hostname === "::1" || hostname === "0:0:0:0:0:0:0:1") {
    return true;
  }

  const mappedIpv4 = getMappedIpv4(hostname);
  if (mappedIpv4 !== undefined) {
    return isBlockedIpv4(mappedIpv4);
  }

  const compatibleIpv4 = getCompatibleIpv4(hostname);
  if (compatibleIpv4 !== undefined) {
    return isBlockedIpv4(compatibleIpv4);
  }

  const firstHextet = hostname.split(":", 1)[0];
  return /^f[cd][0-9a-f]{2}$/.test(firstHextet) || /^fe[89ab][0-9a-f]$/.test(firstHextet);
}

function isBlockedIpv4(hostname: string): boolean {
  const ipv4Parts = hostname.split(".");
  if (ipv4Parts.length !== 4) {
    return false;
  }

  const octets = ipv4Parts.map((part) => Number(part));
  if (!octets.every((octet, index) => String(octet) === ipv4Parts[index] && octet >= 0 && octet <= 255)) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 169 && second === 254)
  );
}

function getMappedIpv4(hostname: string): string | undefined {
  const mappedPrefixes = ["::ffff:", "0:0:0:0:0:ffff:"];
  const prefix = mappedPrefixes.find((candidate) => hostname.startsWith(candidate));
  if (prefix === undefined) {
    return undefined;
  }

  const mappedValue = hostname.slice(prefix.length);
  if (mappedValue.includes(".")) {
    return mappedValue;
  }

  const hextets = mappedValue.split(":");
  if (hextets.length !== 2 || !hextets.every((hextet) => /^[0-9a-f]{1,4}$/.test(hextet))) {
    return undefined;
  }

  const high = Number.parseInt(hextets[0], 16);
  const low = Number.parseInt(hextets[1], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

function getCompatibleIpv4(hostname: string): string | undefined {
  if (hostname.startsWith("::")) {
    return decodeIpv4Tail(hostname.slice(2));
  }

  const hextets = hostname.split(":");
  if (hextets.length !== 8 || !hextets.slice(0, 6).every((hextet) => hextet === "0")) {
    return undefined;
  }

  return decodeIpv4Tail(hextets.slice(6).join(":"));
}

function decodeIpv4Tail(value: string): string | undefined {
  if (value.includes(".")) {
    return value;
  }

  const hextets = value.split(":");
  if (hextets.length !== 2 || !hextets.every((hextet) => /^[0-9a-f]{1,4}$/.test(hextet))) {
    return undefined;
  }

  const high = Number.parseInt(hextets[0], 16);
  const low = Number.parseInt(hextets[1], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}
