import { buildServer } from "./server.js";

const app = buildServer();
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

async function shutdown(signal: NodeJS.Signals) {
  app.log.info({ signal }, "shutting down server");
  await app.close();
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

await app.listen({ port, host });
