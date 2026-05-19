import { PrismaClient } from "./generated/prisma/client.js";
import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";

export type LinkCreateResult = {
  id: string;
  originalUrl: string;
  shortCode: string;
  isCustomAlias: boolean;
  expiresAt: Date | null;
};

export type DatabaseClient = {
  link: {
    create: (args: { data: { originalUrl: string; shortCode: string; isCustomAlias: boolean; expiresAt: Date | null } }) => Promise<LinkCreateResult>;
  };
  $queryRaw: (query: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
  $disconnect: () => Promise<void>;
};

type DatabasePluginOptions = {
  prisma?: DatabaseClient;
};

export function createPrismaClient(): PrismaClient {
  return new PrismaClient();
}

const databasePlugin: FastifyPluginAsync<DatabasePluginOptions> = async (app, options) => {
  const prisma = options.prisma ?? createPrismaClient();

  app.decorate("prisma", prisma);
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
};

export const database = fp(databasePlugin, { name: "database" });
