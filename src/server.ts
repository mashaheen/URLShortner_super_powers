import Fastify from "fastify";
import helmet from "@fastify/helmet";

type ServerOptions = {
  logger?: boolean;
};

export function buildServer(options: ServerOptions = {}) {
  const app = Fastify({ logger: options.logger ?? true });

  app.register(helmet);

  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}
