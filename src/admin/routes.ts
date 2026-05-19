import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  deleteAdminSession,
  findAdminBySessionToken,
  SESSION_MAX_AGE_SECONDS,
  verifyAdminCredentials,
} from "./auth.js";

type AdminAuthRoutesOptions = {
  sessionSecret: string;
  cookieSecure: boolean;
};

type LoginBody = {
  email?: string;
  password?: string;
};

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const part of cookieHeader?.split(";") ?? []) {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (!rawName || rawValue.length === 0) {
      continue;
    }

    try {
      cookies[rawName] = decodeURIComponent(rawValue.join("="));
    } catch {
      continue;
    }
  }

  return cookies;
}

function getSessionToken(request: FastifyRequest): string | undefined {
  return parseCookies(request.headers.cookie)[ADMIN_SESSION_COOKIE];
}

function setSessionCookie(reply: FastifyReply, token: string, options: AdminAuthRoutesOptions): void {
  const secure = options.cookieSecure ? "; Secure" : "";
  reply.header(
    "Set-Cookie",
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_MAX_AGE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`,
  );
}

function clearSessionCookie(reply: FastifyReply, options: AdminAuthRoutesOptions): void {
  const secure = options.cookieSecure ? "; Secure" : "";
  reply.header("Set-Cookie", `${ADMIN_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);
}

export const adminAuthRoutes: FastifyPluginAsync<AdminAuthRoutesOptions> = async (app, options) => {
  app.post<{ Body: LoginBody }>("/api/admin/session", async (request, reply) => {
    const email = typeof request.body?.email === "string" ? request.body.email : "";
    const password = typeof request.body?.password === "string" ? request.body.password : "";
    const admin = await verifyAdminCredentials({ db: app.prisma, email, password });

    if (!admin) {
      return reply.code(401).send({ code: "INVALID_CREDENTIALS", message: "Invalid email or password." });
    }

    const session = await createAdminSession({ db: app.prisma, adminUserId: admin.id, sessionSecret: options.sessionSecret });
    setSessionCookie(reply, session.token, options);

    return reply.code(204).send();
  });

  app.get("/api/admin/session", async (request, reply) => {
    const token = getSessionToken(request);

    if (!token) {
      return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Admin session is required." });
    }

    const admin = await findAdminBySessionToken({ db: app.prisma, token, sessionSecret: options.sessionSecret });

    if (!admin) {
      clearSessionCookie(reply, options);
      return reply.code(401).send({ code: "UNAUTHENTICATED", message: "Admin session is required." });
    }

    return { admin };
  });

  app.delete("/api/admin/session", async (request, reply) => {
    const token = getSessionToken(request);

    if (token) {
      await deleteAdminSession({ db: app.prisma, token, sessionSecret: options.sessionSecret });
    }

    clearSessionCookie(reply, options);
    return reply.code(204).send();
  });
};
