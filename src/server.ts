import Fastify from "fastify";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { adminAuthRoutes } from "./admin/routes.js";
import { readCookieSecure } from "./config.js";
import { database, type DatabaseClient } from "./db.js";
import { linkRoutes } from "./links/routes.js";
import { publicWebRoutes } from "./public-web.js";
import { redirectRoutes } from "./redirect-routes.js";

type ServerOptions = {
  logger?: boolean;
  prisma?: DatabaseClient;
  publicBaseUrl?: string;
  ipHashSecret: string;
  sessionSecret: string;
  cookieSecure?: boolean;
  webRoot?: string;
};

export function buildServer(options: ServerOptions) {
  const app = Fastify({ logger: options.logger ?? true });

  app.register(helmet);
  app.register(swagger, {
    openapi: {
      info: {
        title: "URL Shortener API",
        description:
          "Public link creation, admin management, analytics, redirects, and operational endpoints for the URL shortener.",
        version: "1.0.0",
      },
      tags: [
        { name: "operations", description: "Operational endpoints" },
        { name: "public", description: "Anonymous public link APIs" },
        { name: "admin", description: "Authenticated admin APIs" },
      ],
    },
  });
  app.register(swaggerUi, { routePrefix: "/docs" });
  app.register(database, { prisma: options.prisma });
  app.register(linkRoutes, { publicBaseUrl: options.publicBaseUrl ?? process.env.PUBLIC_BASE_URL ?? "http://localhost:3000" });
  app.register(adminAuthRoutes, {
    sessionSecret: options.sessionSecret,
    cookieSecure: options.cookieSecure ?? readCookieSecure(process.env),
  });

  app.get(
    "/health",
    {
      schema: {
        tags: ["operations"],
        summary: "Check service health",
        response: {
          200: {
            type: "object",
            required: ["status", "database"],
            properties: {
              status: { type: "string", enum: ["ok"] },
              database: { type: "string", enum: ["ok"] },
            },
          },
          503: {
            type: "object",
            required: ["status", "database"],
            properties: {
              status: { type: "string", enum: ["error"] },
              database: { type: "string", enum: ["unavailable"] },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        await app.prisma.$queryRaw`SELECT 1`;

        return { status: "ok", database: "ok" };
      } catch (error) {
        app.log.warn({ error }, "database health check failed");

        return reply.code(503).send({ status: "error", database: "unavailable" });
      }
    },
  );

  app.register(publicWebRoutes, { webRoot: options.webRoot });
  app.register(redirectRoutes, { ipHashSecret: options.ipHashSecret });

  return app;
}
