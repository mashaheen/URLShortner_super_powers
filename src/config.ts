export function readIpHashSecret(env: Record<string, string | undefined>): string {
  const secret = env.IP_HASH_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new Error("IP_HASH_SECRET is required for IP hash privacy");
  }

  return secret;
}
