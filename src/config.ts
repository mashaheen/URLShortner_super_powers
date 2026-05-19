export function readIpHashSecret(env: Record<string, string | undefined>): string {
  const secret = env.IP_HASH_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new Error("IP_HASH_SECRET is required for IP hash privacy");
  }

  return secret;
}

export function readSessionSecret(env: Record<string, string | undefined>): string {
  const secret = env.SESSION_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is required for admin sessions");
  }

  return secret;
}

export function readCookieSecure(env: Record<string, string | undefined>): boolean {
  if (env.COOKIE_SECURE !== undefined) {
    return env.COOKIE_SECURE === "true";
  }

  return env.NODE_ENV === "production";
}
