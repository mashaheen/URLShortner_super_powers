import { PrismaClient } from "./generated/prisma/client.js";
import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";

export type DatabaseClient = {
  link: {
    findUnique: (args: { where: { shortCode: string } }) => Promise<{
      id: string;
      originalUrl: string;
      shortCode: string;
      isActive: boolean;
      expiresAt: Date | null;
    } | null>;
    update: (args: { where: { id: string }; data: { totalClickCount: { increment: number } } }) => Promise<unknown>;
  };
  clickEvent: {
    create: (args: {
      data: {
        linkId: string;
        referrerHost: string | null;
        deviceType: string;
        browser: string | null;
        ipHash: string | null;
      };
    }) => Promise<unknown>;
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
