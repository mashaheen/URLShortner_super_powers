import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";

export function generateShortCode(length = 7): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError("Short code length must be at least 1.");
  }

  const bytes = randomBytes(length);
  let code = "";

  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length];
  }

  return code;
}
