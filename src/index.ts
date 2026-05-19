import { readCookieSecure, readIpHashSecret, readSessionSecret } from "./config.js";
import { buildServer } from "./server.js";

const app = buildServer({
  ipHashSecret: readIpHashSecret(process.env),
  sessionSecret: readSessionSecret(process.env),
  cookieSecure: readCookieSecure(process.env),
});
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
