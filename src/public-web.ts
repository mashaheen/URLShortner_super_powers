import { existsSync } from "node:fs";
import { join } from "node:path";
import staticPlugin from "@fastify/static";
import type { FastifyPluginAsync } from "fastify";

type PublicWebRoutesOptions = {
  webRoot?: string;
};

export const publicWebRoutes: FastifyPluginAsync<PublicWebRoutesOptions> = async (app, options) => {
  if (!options.webRoot || !existsSync(join(options.webRoot, "index.html"))) {
    return;
  }

  await app.register(staticPlugin, {
    root: options.webRoot,
    prefix: "/",
    wildcard: false,
    dotfiles: "deny",
    globIgnore: ["api/**", "**/.*", "**/.*/**"],
    allowedPath: (pathName) => !pathName.startsWith("/api/"),
  });
};
