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

export type LinkAdminResult = LinkCreateResult & {
  isActive: boolean;
  totalClickCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type LinkAdminWhere = {
  isActive?: boolean;
  OR?: Array<{ shortCode: { contains: string; mode: "insensitive" } } | { originalUrl: { contains: string; mode: "insensitive" } }>;
};

type LinkCountWhere = LinkAdminWhere | Record<string, never>;

type LinkAggregate = (args: { _sum: { totalClickCount: true } }) => PromiseLike<{ _sum: { totalClickCount: number | null } }>;

type ClickEventWhere = {
  clickedAt?: { gte?: Date; lte?: Date };
};

type ClickEventGroupByArgs =
  | { by: ["referrerHost"]; _count: { _all: true }; orderBy?: [{ _count: { referrerHost: "desc" } }, { referrerHost: "asc" }]; take?: number }
  | { by: ["deviceType"]; _count: { _all: true }; orderBy?: [{ _count: { deviceType: "desc" } }, { deviceType: "asc" }]; take?: number };

type ClickEventGroupByResult =
  | { referrerHost: string | null; _count: { _all: number } }
  | { deviceType: string | null; _count: { _all: number } };

type ClickEventCount = (args: { where?: ClickEventWhere }) => PromiseLike<number>;
type ClickEventGroupBy = (args: ClickEventGroupByArgs) => PromiseLike<ClickEventGroupByResult[]>;

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
    findMany?: (args: { where: LinkAdminWhere; orderBy: { createdAt: "desc" }; skip: number; take: number }) => Promise<LinkAdminResult[]>;
    count?: (args: { where: LinkCountWhere }) => Promise<number>;
    aggregate?: LinkAggregate;
    update: (args: {
      where: { id: string };
      data:
        | { totalClickCount: { increment: number } }
        | { originalUrl?: string; isActive?: boolean; expiresAt?: Date | null }
        | { isActive: false };
    }) => Promise<unknown>;
    delete?: (args: { where: { id: string } }) => Promise<unknown>;
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
    count?: ClickEventCount;
    groupBy?: ClickEventGroupBy;
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
  const prisma = (options.prisma ?? createPrismaClient()) as DatabaseClient;

  app.decorate("prisma", prisma);
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
};

export const database = fp(databasePlugin, { name: "database" });
