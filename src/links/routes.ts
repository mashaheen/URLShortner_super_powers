import type { FastifyPluginAsync } from "fastify";
import { createLink, LinkCodeCollisionError, LinkValidationError } from "./service.js";
import type { CreateLinkInput } from "./validation.js";

type LinkRoutesOptions = {
  publicBaseUrl: string;
};

export const linkRoutes: FastifyPluginAsync<LinkRoutesOptions> = async (app, options) => {
  app.post<{ Body: CreateLinkInput }>(
    "/api/links",
    {
      // Link creation keeps service-level validation so existing structured error codes remain stable.
      validatorCompiler: () => () => true,
      schema: {
        tags: ["public"],
        summary: "Create short link",
        body: {
          type: "object",
          required: ["url"],
          properties: {
            url: { type: "string", format: "uri", description: "HTTP or HTTPS URL to shorten." },
            alias: {
              type: "string",
              minLength: 3,
              maxLength: 64,
              pattern: "^[A-Za-z0-9_-]{3,64}$",
              description: "Optional custom short code.",
            },
            expiresAt: {
              anyOf: [{ type: "string", format: "date-time" }, { type: "number" }],
              description: "Optional future expiration timestamp as an ISO date-time string or epoch value.",
            },
          },
        },
        response: {
          201: {
            type: "object",
            required: ["id", "url", "originalUrl", "shortCode", "shortUrl", "isCustomAlias", "expiresAt", "createdAt"],
            properties: {
              id: { type: "string", format: "uuid" },
              url: { type: "string", format: "uri" },
              originalUrl: { type: "string", format: "uri" },
              shortCode: { type: "string" },
              shortUrl: { type: "string", format: "uri" },
              isCustomAlias: { type: "boolean" },
              expiresAt: { type: "string", format: "date-time", nullable: true },
              createdAt: { type: "string", format: "date-time" },
            },
          },
          400: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", enum: ["INVALID_URL", "BLOCKED_URL", "INVALID_ALIAS", "RESERVED_ALIAS", "INVALID_EXPIRATION"] },
              message: { type: "string" },
            },
          },
          409: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", enum: ["ALIAS_UNAVAILABLE"] },
              message: { type: "string" },
            },
          },
          429: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", enum: ["RATE_LIMITED"] },
              message: { type: "string" },
            },
          },
          500: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", enum: ["SHORT_CODE_UNAVAILABLE", "INTERNAL_ERROR"] },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
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
    },
  );
};
