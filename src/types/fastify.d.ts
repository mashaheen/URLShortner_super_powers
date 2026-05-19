import type { DatabaseClient } from "../db.js";

declare module "fastify" {
  interface FastifyInstance {
    prisma: DatabaseClient;
  }
}
