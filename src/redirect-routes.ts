import type { FastifyPluginAsync } from "fastify";
import { detectBrowser, detectDeviceType, hashIpAddress, isBotUserAgent, normalizeReferrerHost } from "./redirect-analytics.js";

type RedirectParams = {
  code: string;
};

type RedirectRoutesOptions = {
  ipHashSecret: string;
};

function unavailablePage(message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Short link unavailable</title></head><body><h1>Short link unavailable</h1><p>${message}</p></body></html>`;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const redirectRoutes: FastifyPluginAsync<RedirectRoutesOptions> = async (app, options) => {
  app.get<{ Params: RedirectParams }>("/:code", async (request, reply) => {
    const link = await app.prisma.link.findUnique({ where: { shortCode: request.params.code } });

    if (!link) {
      return reply.code(404).type("text/html").send(unavailablePage("Short link unavailable"));
    }

    if (!link.isActive) {
      return reply.code(410).type("text/html").send(unavailablePage("This short link is no longer active."));
    }

    if (link.expiresAt && link.expiresAt <= new Date()) {
      return reply.code(410).type("text/html").send(unavailablePage("This short link has expired."));
    }

    const userAgent = request.headers["user-agent"];

    if (!isBotUserAgent(userAgent)) {
      try {
        await app.prisma.clickEvent.create({
          data: {
            linkId: link.id,
            referrerHost: normalizeReferrerHost(firstHeaderValue(request.headers.referer)),
            deviceType: detectDeviceType(userAgent),
            browser: detectBrowser(userAgent),
            ipHash: hashIpAddress(request.ip, options.ipHashSecret),
          },
        });

        await app.prisma.link.update({
          where: { id: link.id },
          data: { totalClickCount: { increment: 1 } },
        });
      } catch (error) {
        request.log.warn({ error, linkId: link.id }, "failed to record redirect analytics");
      }
    }

    return reply.redirect(link.originalUrl, 302);
  });
};
