# M4A OpenAPI Docker Final Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the URL shortener v1 with OpenAPI documentation, a production Docker image, Docker Compose app service, docs updates, and final verification.

**Architecture:** Keep route ownership in the existing Fastify server and add OpenAPI through Fastify plugins registered before existing routes. The production container builds the server and Vite frontend in one image, generates Prisma Client during install, and serves the built web assets from `dist/web` through the existing `webRoot` option.

**Tech Stack:** Fastify, TypeScript, React, Vite, Prisma, PostgreSQL, Docker, Docker Compose, Vitest.

---

## File Structure

- Modify `package.json`: add OpenAPI dependencies and keep existing scripts.
- Modify `package-lock.json`: lock the OpenAPI dependencies.
- Modify `src/server.ts`: register Swagger JSON and Swagger UI at `/docs`, and add schemas for health and public link creation.
- Modify `src/links/routes.ts`: add OpenAPI route schema metadata for `POST /api/links`.
- Modify `tests/health.test.ts`: verify `/docs/json` exposes the OpenAPI document and `/docs` serves the UI.
- Create `Dockerfile`: multi-stage production image for backend plus built frontend.
- Create `.dockerignore`: exclude local dependencies, build outputs, VCS files, logs, and worktrees from Docker context.
- Modify `docker-compose.yml`: add the app service, database URL, secrets, healthcheck, dependency on PostgreSQL, and port mapping.
- Modify `README.md`: document local development, production Docker image, compose startup, required environment variables, and `/docs`.
- Modify `docs/superpowers/plans/implementation-tracker.md`: mark M4A complete and point current plan to this file after final verification.

### Task 1: OpenAPI Docs

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/server.ts`
- Modify: `src/links/routes.ts`
- Modify: `tests/health.test.ts`

- [ ] **Step 1: Add OpenAPI dependencies**

Install Fastify Swagger plugins:

```bash
npm install @fastify/swagger @fastify/swagger-ui
```

Expected: `package.json` includes `@fastify/swagger` and `@fastify/swagger-ui`, and `package-lock.json` is updated.

- [ ] **Step 2: Add docs tests**

Extend `tests/health.test.ts` with coverage that builds the server using the existing test setup, calls `GET /docs/json`, and asserts:

```ts
expect(response.statusCode).toBe(200);
expect(response.json()).toMatchObject({
  openapi: expect.stringMatching(/^3\./),
  info: { title: "URL Shortener API", version: "1.0.0" },
});
expect(response.json().paths["/api/links"].post.summary).toBe("Create short link");
```

Add a second assertion for `GET /docs`:

```ts
expect(response.statusCode).toBe(200);
expect(response.headers["content-type"]).toContain("text/html");
```

- [ ] **Step 3: Register Swagger plugins**

In `src/server.ts`, import and register Swagger before existing routes:

```ts
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
```

Register inside `buildServer` after `helmet`:

```ts
  app.register(swagger, {
    openapi: {
      info: {
        title: "URL Shortener API",
        description: "Public link creation, admin management, analytics, redirects, and operational endpoints for the URL shortener.",
        version: "1.0.0",
      },
      tags: [
        { name: "operations", description: "Operational endpoints" },
        { name: "public", description: "Anonymous public link APIs" },
        { name: "admin", description: "Authenticated admin APIs" },
      ],
    },
  });
  app.register(swaggerUi, { routePrefix: "/docs" });
```

Update the `/health` route options to include a schema with tags, summary, and response shapes.

- [ ] **Step 4: Document public link creation schema**

In `src/links/routes.ts`, add route schema metadata to `POST /api/links` covering request body fields `url`, `alias`, and `expiresAt`, success response fields `id`, `originalUrl`, `shortCode`, `shortUrl`, `expiresAt`, `createdAt`, and validation/rate-limit error responses.

Keep the implementation behavior unchanged.

### Task 2: Production Docker Assets

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Create Dockerfile**

Create a multi-stage `Dockerfile` with:

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
COPY web ./web
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Create .dockerignore**

Create `.dockerignore` containing:

```gitignore
.git
.worktrees
node_modules
dist
coverage
npm-debug.log*
.env
.env.*
```

- [ ] **Step 3: Add app service to Docker Compose**

Update `docker-compose.yml` to add `app` using `build: .`, expose `3000:3000`, depend on healthy PostgreSQL, and set:

```yaml
DATABASE_URL: postgresql://urlshortener:urlshortener@postgres:5432/urlshortener
PUBLIC_BASE_URL: http://localhost:3000
SESSION_SECRET: compose-session-secret-change-me
IP_HASH_SECRET: compose-ip-hash-secret-change-me
COOKIE_SECURE: "false"
PORT: "3000"
HOST: 0.0.0.0
```

Add an app healthcheck using `wget -qO- http://127.0.0.1:3000/health`.

### Task 3: Docs And Tracker

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/implementation-tracker.md`

- [ ] **Step 1: Update README**

Document:

- `npm install`, `npm run db:migrate`, `npm run dev`, `npm run dev:web` for development.
- `npm run typecheck`, `npm test`, `npm run build` for verification.
- `docker compose up --build` for app plus PostgreSQL.
- Required environment variables: `DATABASE_URL`, `PUBLIC_BASE_URL`, `SESSION_SECRET`, `IP_HASH_SECRET`, `COOKIE_SECURE`, `PORT`, `HOST`.
- OpenAPI docs available at `/docs` and JSON at `/docs/json`.

- [ ] **Step 2: Update implementation tracker**

Update `docs/superpowers/plans/implementation-tracker.md`:

```md
- [x] M4A: OpenAPI docs, Docker production image, final verification
```

Set current plan to:

```md
- Current plan: `docs/superpowers/plans/2026-05-20-url-shortener-m4a-openapi-docker-final.md`
```

### Task 4: Final Verification, Merge, Cleanup

**Files:**
- No code files unless verification exposes defects.

- [ ] **Step 1: Run end-of-milestone verification only**

Run these commands after all implementation tasks are complete:

```bash
npm run typecheck
npm test
npm run build
docker build -t url-shortener-super-powers:m4a .
```

Expected: all commands pass.

- [ ] **Step 2: Commit, merge into main, and remove worktree**

Commit the M4A changes on `m4a-openapi-docker-final`, merge the branch into `main`, then remove `.worktrees/m4a-openapi-docker-final` after confirming `main` contains the work.

## Self-Review

- Spec coverage: Implements OpenAPI docs at `/docs`, Docker app container support, Docker Compose app plus PostgreSQL, operational docs, and final verification from the design spec.
- Placeholder scan: No placeholders, TODOs, or unspecified file paths remain.
- Type consistency: File paths, route paths, environment variable names, and scripts match the current codebase.
