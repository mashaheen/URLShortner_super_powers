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
  adminUser: {
    findUnique: (args: { where: { email: string } }) => Promise<{
      id: string;
      email: string;
      passwordHash: string;
    } | null>;
    update: (args: { where: { id: string }; data: { lastLoginAt: Date } }) => Promise<unknown>;
  };
  adminSession: {
    create: (args: { data: { adminUserId: string; sessionTokenHash: string; expiresAt: Date } }) => Promise<{
      id: string;
      expiresAt: Date;
    }>;
    findUnique: (args: {
      where: { sessionTokenHash: string };
      include: { adminUser: { select: { id: true; email: true } } };
    }) => Promise<{
      expiresAt: Date;
      adminUser: { id: string; email: string };
    } | null>;
    deleteMany: (args: { where: { sessionTokenHash?: string; expiresAt?: { lt: Date } } }) => Promise<{ count: number }>;
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
