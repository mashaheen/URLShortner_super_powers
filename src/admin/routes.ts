import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { LinkAdminResult } from "../db.js";
import { validateCreateLinkInput } from "../links/validation.js";
import {
  ADMIN_SESSION_COOKIE,
  type AuthenticatedAdmin,
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

type ListLinksQuery = {
  q?: string;
  status?: string;
  page?: string;
  pageSize?: string;
};

type ClicksByDayQuery = {
  from?: string;
  to?: string;
};

type AnalyticsLimitQuery = {
  limit?: string;
};

type LinkParams = {
  id: string;
};

type UpdateLinkBody = {
  originalUrl?: unknown;
  isActive?: unknown;
  expiresAt?: unknown;
};

type AdminLinkWhere = {
  isActive?: boolean;
  OR?: Array<{ shortCode: { contains: string; mode: "insensitive" } } | { originalUrl: { contains: string; mode: "insensitive" } }>;
};

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;
const MAX_ANALYTICS_LIMIT = 25;

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

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  options: AdminAuthRoutesOptions,
): Promise<AuthenticatedAdmin | null> {
  const token = getSessionToken(request);

  if (!token) {
    void reply.code(401).send({ code: "UNAUTHENTICATED", message: "Admin session is required." });
    return null;
  }

  const admin = await findAdminBySessionToken({ db: request.server.prisma, token, sessionSecret: options.sessionSecret });

  if (!admin) {
    clearSessionCookie(reply, options);
    void reply.code(401).send({ code: "UNAUTHENTICATED", message: "Admin session is required." });
    return null;
  }

  return admin;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAnalyticsLimit(value: string | undefined): number {
  return Math.min(parsePositiveInt(value, MAX_ANALYTICS_LIMIT), MAX_ANALYTICS_LIMIT);
}

function parseAnalyticsDateRange(query: ClicksByDayQuery): { ok: true; where: { clickedAt?: { gte?: Date; lte?: Date } } } | { ok: false } {
  const clickedAt: { gte?: Date; lte?: Date } = {};

  if (query.from) {
    const from = new Date(query.from);
    if (Number.isNaN(from.getTime())) {
      return { ok: false };
    }

    clickedAt.gte = from;
  }

  if (query.to) {
    const to = new Date(query.to);
    if (Number.isNaN(to.getTime())) {
      return { ok: false };
    }

    clickedAt.lte = to;
  }

  if (clickedAt.gte && clickedAt.lte && clickedAt.gte > clickedAt.lte) {
    return { ok: false };
  }

  return Object.keys(clickedAt).length > 0 ? { ok: true, where: { clickedAt } } : { ok: true, where: {} };
}

function buildLinkWhere(query: ListLinksQuery): AdminLinkWhere {
  const where: AdminLinkWhere = {};
  const search = query.q?.trim();

  if (query.status === "active") {
    where.isActive = true;
  } else if (query.status === "inactive") {
    where.isActive = false;
  }

  if (search) {
    where.OR = [
      { shortCode: { contains: search, mode: "insensitive" } },
      { originalUrl: { contains: search, mode: "insensitive" } },
    ];
  }

  return where;
}

function serializeLink(link: LinkAdminResult) {
  return {
    id: link.id,
    originalUrl: link.originalUrl,
    shortCode: link.shortCode,
    isCustomAlias: link.isCustomAlias,
    isActive: link.isActive,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    totalClickCount: link.totalClickCount,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  };
}

function parseUpdateLinkBody(body: UpdateLinkBody):
  | { ok: true; data: { originalUrl?: string; isActive?: boolean; expiresAt?: Date | null } }
  | { ok: false } {
  if (typeof body !== "object" || body === null) {
    return { ok: false };
  }

  const data: { originalUrl?: string; isActive?: boolean; expiresAt?: Date | null } = {};

  if ("originalUrl" in body) {
    if (typeof body.originalUrl !== "string") {
      return { ok: false };
    }

    const validation = validateCreateLinkInput({ url: body.originalUrl });
    if (!validation.ok) {
      return { ok: false };
    }

    data.originalUrl = new URL(validation.value.url).toString();
  }

  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") {
      return { ok: false };
    }

    data.isActive = body.isActive;
  }

  if ("expiresAt" in body) {
    if (body.expiresAt === null) {
      data.expiresAt = null;
    } else if (typeof body.expiresAt === "string") {
      const expiresAt = new Date(body.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        return { ok: false };
      }

      data.expiresAt = expiresAt;
    } else {
      return { ok: false };
    }
  }

  if (Object.keys(data).length === 0) {
    return { ok: false };
  }

  return { ok: true, data };
}

function isRecordNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2025";
}

function requireLinkFindMany(db: FastifyRequest["server"]["prisma"]) {
  if (!db.link.findMany) {
    throw new Error("Admin link listing requires link.findMany.");
  }

  return db.link.findMany;
}

function requireLinkCount(db: FastifyRequest["server"]["prisma"]) {
  if (!db.link.count) {
    throw new Error("Admin link listing requires link.count.");
  }

  return db.link.count;
}

function requireLinkDelete(db: FastifyRequest["server"]["prisma"]) {
  if (!db.link.delete) {
    throw new Error("Admin link deletion requires link.delete.");
  }

  return db.link.delete;
}

function requireClickEventCount(db: FastifyRequest["server"]["prisma"]) {
  if (!db.clickEvent.count) {
    throw new Error("Admin analytics overview requires clickEvent.count.");
  }

  return db.clickEvent.count;
}

function requireClickEventGroupBy(db: FastifyRequest["server"]["prisma"]) {
  if (!db.clickEvent.groupBy) {
    throw new Error("Admin analytics charts require clickEvent.groupBy.");
  }

  return db.clickEvent.groupBy as (args: {
    by: ["clickedAt"] | ["referrerHost"] | ["deviceType"];
    where?: { clickedAt?: { gte?: Date; lte?: Date } };
    orderBy?: unknown;
    take?: number;
  }) => Promise<Array<{ clickedAt?: Date; referrerHost?: string | null; deviceType?: string | null; _count: { _all: number } }>>;
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

  app.get<{ Querystring: ListLinksQuery }>("/api/admin/links", async (request, reply) => {
    if (!(await requireAdmin(request, reply, options))) {
      return reply;
    }

    const page = parsePositiveInt(request.query.page, 1);
    const pageSize = Math.min(parsePositiveInt(request.query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const where = buildLinkWhere(request.query);
    const findMany = requireLinkFindMany(app.prisma);
    const count = requireLinkCount(app.prisma);
    const [links, totalItems] = await Promise.all([
      findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      count({ where }),
    ]);

    return {
      links: links.map(serializeLink),
      pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
    };
  });

  app.get("/api/admin/analytics/overview", async (request, reply) => {
    if (!(await requireAdmin(request, reply, options))) {
      return reply;
    }

    const findMany = requireLinkFindMany(app.prisma);
    const count = requireClickEventCount(app.prisma);
    const links = await findMany({ where: {}, orderBy: { createdAt: "desc" }, skip: 0, take: Number.MAX_SAFE_INTEGER });
    const recentClicks = await count({ where: { clickedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });

    return {
      overview: {
        totalLinks: links.length,
        totalClicks: links.reduce((total, link) => total + link.totalClickCount, 0),
        activeLinks: links.filter((link) => link.isActive).length,
        recentClicks,
      },
    };
  });

  app.get<{ Querystring: ClicksByDayQuery }>("/api/admin/analytics/clicks-by-day", async (request, reply) => {
    if (!(await requireAdmin(request, reply, options))) {
      return reply;
    }

    const parsed = parseAnalyticsDateRange(request.query);
    if (!parsed.ok) {
      return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Invalid analytics request." });
    }

    const rows = await requireClickEventGroupBy(app.prisma)({ by: ["clickedAt"], where: parsed.where, orderBy: { clickedAt: "asc" } });
    const clicksByDate = new Map<string, number>();

    for (const row of rows) {
      if (!row.clickedAt) {
        continue;
      }

      const date = row.clickedAt.toISOString().slice(0, 10);
      clicksByDate.set(date, (clicksByDate.get(date) ?? 0) + row._count._all);
    }

    const days = [...clicksByDate.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, clicks]) => ({ date, clicks }));

    return { days };
  });

  app.get<{ Querystring: AnalyticsLimitQuery }>("/api/admin/analytics/referrers", async (request, reply) => {
    if (!(await requireAdmin(request, reply, options))) {
      return reply;
    }

    const rows = await requireClickEventGroupBy(app.prisma)({
      by: ["referrerHost"],
      orderBy: { _count: { referrerHost: "desc" } },
      take: parseAnalyticsLimit(request.query.limit),
    });

    return {
      referrers: rows.map((row) => {
        const referrerHost = "referrerHost" in row ? row.referrerHost : null;
        return { referrer: referrerHost?.trim() || "Direct", clicks: row._count._all };
      }),
    };
  });

  app.get("/api/admin/analytics/devices", async (request, reply) => {
    if (!(await requireAdmin(request, reply, options))) {
      return reply;
    }

    const rows = await requireClickEventGroupBy(app.prisma)({ by: ["deviceType"], orderBy: { _count: { deviceType: "desc" } } });

    return {
      devices: rows.map((row) => {
        const deviceType = "deviceType" in row ? row.deviceType : null;
        return { deviceType: deviceType?.trim() || "unknown", clicks: row._count._all };
      }),
    };
  });

  app.patch<{ Params: LinkParams; Body: UpdateLinkBody }>("/api/admin/links/:id", async (request, reply) => {
    if (!(await requireAdmin(request, reply, options))) {
      return reply;
    }

    const parsed = parseUpdateLinkBody(request.body ?? {});

    if (!parsed.ok) {
      return reply.code(400).send({ code: "VALIDATION_ERROR", message: "Invalid admin link request." });
    }

    try {
      const link = await app.prisma.link.update({ where: { id: request.params.id }, data: parsed.data });
      return { link: serializeLink(link as LinkAdminResult) };
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "Link not found." });
      }

      throw error;
    }
  });

  app.post<{ Params: LinkParams }>("/api/admin/links/:id/deactivate", async (request, reply) => {
    if (!(await requireAdmin(request, reply, options))) {
      return reply;
    }

    try {
      const link = await app.prisma.link.update({ where: { id: request.params.id }, data: { isActive: false } });
      return { link: serializeLink(link as LinkAdminResult) };
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "Link not found." });
      }

      throw error;
    }
  });

  app.delete<{ Params: LinkParams }>("/api/admin/links/:id", async (request, reply) => {
    if (!(await requireAdmin(request, reply, options))) {
      return reply;
    }

    try {
      await requireLinkDelete(app.prisma)({ where: { id: request.params.id } });
      return reply.code(204).send();
    } catch (error) {
      if (isRecordNotFoundError(error)) {
        return reply.code(404).send({ code: "NOT_FOUND", message: "Link not found." });
      }

      throw error;
    }
  });
};
