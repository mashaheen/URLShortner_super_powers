import Fastify from "fastify";
import helmet from "@fastify/helmet";
import { database, type DatabaseClient } from "./db.js";
import { redirectRoutes } from "./redirect-routes.js";

type ServerOptions = {
  logger?: boolean;
  prisma?: DatabaseClient;
  ipHashSecret: string;
};

export function buildServer(options: ServerOptions) {
  const app = Fastify({ logger: options.logger ?? true });

  app.register(helmet);
  app.register(database, { prisma: options.prisma });

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
