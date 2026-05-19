import { createHmac, randomBytes } from "node:crypto";
import { verify } from "argon2";
import type { DatabaseClient } from "../db.js";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const MISSING_ADMIN_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$QGjy10mdzYFxoVRTg6HVxwYY3gBwbkIa59RXlp3Jp4Y";

export type AuthenticatedAdmin = {
  id: string;
  email: string;
};

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string, sessionSecret: string): string {
  return createHmac("sha256", sessionSecret).update(token).digest("hex");
}

export async function verifyAdminCredentials(options: {
  db: DatabaseClient;
  email: string;
  password: string;
}): Promise<AuthenticatedAdmin | null> {
  const admin = await options.db.adminUser.findUnique({ where: { email: options.email.trim().toLowerCase() } });
  const passwordHash = admin?.passwordHash ?? MISSING_ADMIN_PASSWORD_HASH;
  const validPassword = await verify(passwordHash, options.password);

  if (!admin || !validPassword) {
    return null;
  }

  return { id: admin.id, email: admin.email };
}

export async function createAdminSession(options: {
  db: DatabaseClient;
  adminUserId: string;
  sessionSecret: string;
  now?: Date;
}): Promise<{ token: string; expiresAt: Date }> {
  const now = options.now ?? new Date();
  const token = createSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);

  await options.db.adminSession.create({
    data: {
      adminUserId: options.adminUserId,
      sessionTokenHash: hashSessionToken(token, options.sessionSecret),
      expiresAt,
    },
  });

  await options.db.adminUser.update({ where: { id: options.adminUserId }, data: { lastLoginAt: now } });

  return { token, expiresAt };
}

export async function findAdminBySessionToken(options: {
  db: DatabaseClient;
  token: string;
  sessionSecret: string;
  now?: Date;
}): Promise<AuthenticatedAdmin | null> {
  const now = options.now ?? new Date();
  const session = await options.db.adminSession.findUnique({
    where: { sessionTokenHash: hashSessionToken(options.token, options.sessionSecret) },
    include: { adminUser: { select: { id: true, email: true } } },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= now) {
    await deleteAdminSession({ db: options.db, token: options.token, sessionSecret: options.sessionSecret });
    return null;
  }

  return session.adminUser;
}

export async function deleteAdminSession(options: {
  db: DatabaseClient;
  token: string;
  sessionSecret: string;
}): Promise<void> {
  await options.db.adminSession.deleteMany({
    where: { sessionTokenHash: hashSessionToken(options.token, options.sessionSecret) },
  });
}
