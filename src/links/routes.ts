import type { FastifyPluginAsync } from "fastify";
import { createLink, LinkCodeCollisionError, LinkValidationError } from "./service.js";
import type { CreateLinkInput } from "./validation.js";

type LinkRoutesOptions = {
  publicBaseUrl: string;
};

export const linkRoutes: FastifyPluginAsync<LinkRoutesOptions> = async (app, options) => {
  app.post<{ Body: CreateLinkInput }>("/api/links", async (request, reply) => {
    try {
      const link = await createLink({
        db: app.prisma,
        publicBaseUrl: options.publicBaseUrl,
        input: request.body,
      });

      return reply.code(201).send(link);
    } catch (error) {
      if (error instanceof LinkValidationError) {
        return reply.code(400).send({ code: error.code, message: error.message });
      }

      if (error instanceof LinkCodeCollisionError) {
        if (typeof request.body?.alias === "string") {
          return reply.code(409).send({ code: "ALIAS_UNAVAILABLE", message: "Alias is already in use." });
        }

        return reply
          .code(500)
          .send({ code: "SHORT_CODE_UNAVAILABLE", message: "Could not generate a unique short code." });
      }

      request.log.error({ error }, "link creation failed");
      return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Unable to create link." });
    }
  });
};
