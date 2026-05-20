# Technology Stack

This project is a full-stack URL shortener. The technologies below are the main tools used to build, test, run, and deploy it.

## Core Application

| Technology | Responsibility | Where it is used |
| --- | --- | --- |
| TypeScript | Provides typed application code for the backend, frontend, configuration, and tests. | `src/`, `web/src/`, `tests/`, `tsconfig.json`, `web/tsconfig.json` |
| Node.js | Runs the backend server and project tooling. | `package.json`, `src/index.ts`, `src/server.ts` |
| Fastify | Serves the HTTP API, redirects, health endpoint, admin routes, static frontend assets, and OpenAPI docs. | `src/server.ts`, `src/index.ts`, `src/links/routes.ts`, `src/redirect-routes.ts`, `src/admin/routes.ts` |
| Fastify plugins | Add cross-origin headers, security headers, static file serving, plugin structure, Swagger JSON, and Swagger UI. | `package.json`, `src/server.ts` |
| Prisma | Defines the database schema, generates the database client, and runs migrations. | `prisma/schema.prisma`, `prisma.config.ts`, `src/db.ts`, `prisma/migrations/` |
| PostgreSQL | Stores links, click analytics, admin users, and admin sessions. | `prisma/schema.prisma`, `docker-compose.yml`, `DATABASE_URL` |
| Argon2 | Hashes admin passwords for secure authentication. | `package.json`, `src/admin/auth.ts` |
| React | Builds the public URL creation page and admin dashboard UI. | `web/src/App.tsx`, `web/src/AdminApp.tsx`, `web/src/main.tsx` |
| Vite | Runs the frontend dev server and builds production web assets. | `web/vite.config.ts`, `web/index.html`, `package.json` scripts |
| CSS | Styles the public and admin React interfaces. | `web/src/styles.css` |

## Testing and Quality

| Technology | Responsibility | Where it is used |
| --- | --- | --- |
| Vitest | Runs backend service, route, validation, config, and frontend tests. | `tests/`, `web/src/App.test.tsx`, `package.json` test script |
| Testing Library | Tests React components through user-facing behavior. | `web/src/App.test.tsx`, `web/src/test-setup.ts` |
| jsdom | Provides a browser-like DOM environment for React tests. | `package.json`, `web/src/test-setup.ts` |
| TypeScript compiler | Checks backend and frontend types without emitting files. | `npm run typecheck`, `tsconfig.json`, `web/tsconfig.json` |

## Deployment and Operations

| Technology | Responsibility | Where it is used |
| --- | --- | --- |
| Docker | Builds and runs the production application container. | `Dockerfile` |
| Docker Compose | Runs the app and PostgreSQL together for local container-based usage. | `docker-compose.yml` |
| Environment variables | Configure database access, public URL generation, sessions, cookies, host, and port. | `.env.example`, `src/config.ts`, `docker-compose.yml` |
| Prisma migrations | Apply database schema changes in development and container startup. | `prisma/migrations/`, `npm run db:migrate`, `Dockerfile` |
| OpenAPI and Swagger UI | Expose API documentation from the running Fastify app. | `/docs`, `/docs/json`, `@fastify/swagger`, `@fastify/swagger-ui` |
