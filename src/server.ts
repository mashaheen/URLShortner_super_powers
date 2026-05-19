import Fastify from "fastify";
import helmet from "@fastify/helmet";
import { adminAuthRoutes } from "./admin/routes.js";
import { readCookieSecure } from "./config.js";
import { database, type DatabaseClient } from "./db.js";
import { linkRoutes } from "./links/routes.js";
import { redirectRoutes } from "./redirect-routes.js";

type ServerOptions = {
  logger?: boolean;
  prisma?: DatabaseClient;
  publicBaseUrl?: string;
  ipHashSecret: string;
  sessionSecret: string;
  cookieSecure?: boolean;
};

export function buildServer(options: ServerOptions) {
  const app = Fastify({ logger: options.logger ?? true });

  app.register(helmet);
  app.register(database, { prisma: options.prisma });
  app.register(linkRoutes, { publicBaseUrl: options.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:3000" });
  app.register(adminAuthRoutes, {
    sessionSecret: options.sessionSecret,
    cookieSecure: options.cookieSecure ?? readCookieSecure(process.env),
  });

  app.get("/health", async (_request, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;

      return { status: "ok", database: "ok" };
    } catch (error) {
      app.log.warn({ error }, "database health check failed");

      return reply.code(503).send({ status: "error", database: "unavailable" });
    }
  });

  app.register(redirectRoutes, { ipHashSecret: options.ipHashSecret });

  return app;
}
