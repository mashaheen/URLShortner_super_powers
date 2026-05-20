# Project Manual

This manual explains how to run the URL Shortener Super Powers project locally and how to deploy it.

## 1. How to Run the Project Locally

### Prerequisites

Install these tools before starting:

- Node.js 24 or newer, matching the Docker image used by this project.
- npm, included with Node.js.
- PostgreSQL, either installed locally or running through Docker.
- Git, if you are cloning the project from a repository.

Optional tools:

- Docker and Docker Compose, if you want to run PostgreSQL or the full app in containers.
- Prisma Studio, available through the existing `npm run db:studio` script.

### Step 1: Install Dependencies

From the project root, install Node dependencies:

```bash
npm install
```

The `postinstall` script runs `prisma generate`, which prepares the Prisma client.

### Step 2: Configure Environment Variables

Create a local `.env` file using `.env.example` as the starting point:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

The local defaults are:

```env
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgresql://urlshortener:urlshortener@localhost:5432/urlshortener
PUBLIC_BASE_URL=http://localhost:3000
SESSION_SECRET=replace-with-a-long-random-secret
COOKIE_SECURE=false
```

Also add `IP_HASH_SECRET`, because the app uses it when hashing visitor IP addresses for analytics:

```env
IP_HASH_SECRET=replace-with-another-long-random-secret
```

For local development, `COOKIE_SECURE=false` is correct because the app usually runs over plain HTTP.

### Step 3: Start PostgreSQL

Use one of these options.

Option A: Run PostgreSQL locally.

Create a database and user matching the default `DATABASE_URL`:

```bash
createdb urlshortener
```

Make sure your local PostgreSQL credentials match the connection string in `.env`. If they do not, update `DATABASE_URL`.

Option B: Run PostgreSQL with Docker Compose.

```bash
docker compose up -d postgres
```

This starts the `postgres` service from `docker-compose.yml` and exposes it on `localhost:5432`.

### Step 4: Run Database Migrations

Apply the Prisma migrations to the configured database:

```bash
npm run db:migrate
```

This uses `prisma migrate dev`, which is appropriate for local development.

### Step 5: Start the API Server

Start the Fastify backend in watch mode:

```bash
npm run dev
```

The API runs on the configured `PORT`, usually `http://localhost:3000`.

Useful backend URLs:

- Health check: `http://localhost:3000/health`
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/docs/json`

### Step 6: Start the Web App

In a second terminal, start the Vite React frontend:

```bash
npm run dev:web
```

Vite will print the local URL, usually `http://localhost:5173`.

Keep both terminals running during development:

- Terminal 1: `npm run dev`
- Terminal 2: `npm run dev:web`

### Step 7: Verify the Project

Run TypeScript checks:

```bash
npm run typecheck
```

Run the test suite:

```bash
npm test
```

Build the production server and web assets:

```bash
npm run build
```

Start the built production server locally:

```bash
npm start
```

### Step 8: Optional Database Tools

Open Prisma Studio to inspect and edit database records:

```bash
npm run db:studio
```

## 2. How to Deploy the Project

### Deployment Overview

The project can be deployed as a Node.js app or as a Docker image. The existing Dockerfile is the recommended production path because it builds both the TypeScript backend and the Vite frontend, then starts the compiled app.

At runtime, the app needs:

- A PostgreSQL database.
- Production environment variables.
- A public HTTP or HTTPS endpoint.
- Database migrations applied before the server starts.

The Dockerfile already runs production migrations before starting the app:

```bash
npx prisma migrate deploy && node dist/index.js
```

### Step 1: Prepare Production Environment Variables

Set these variables in your hosting platform, container service, or deployment environment:

```env
PORT=3000
HOST=0.0.0.0
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
PUBLIC_BASE_URL=https://your-domain.example
SESSION_SECRET=use-a-long-random-production-secret
IP_HASH_SECRET=use-a-different-long-random-production-secret
COOKIE_SECURE=true
```

Production requirements:

- `DATABASE_URL` must point to the production PostgreSQL database.
- `PUBLIC_BASE_URL` must be the real public URL users will use for short links.
- `SESSION_SECRET` must be long, random, and private.
- `IP_HASH_SECRET` must be long, random, private, and different from `SESSION_SECRET`.
- `COOKIE_SECURE=true` should be used when the app is served over HTTPS.

Do not use the example secrets from `.env.example` or `docker-compose.yml` in production.

### Step 2: Provision PostgreSQL

Create a production PostgreSQL database using your preferred provider, for example:

- A managed PostgreSQL service from your cloud provider.
- A hosted database platform.
- A PostgreSQL container or VM that is backed up and secured.

Confirm that the app environment can connect to the database using `DATABASE_URL`.

### Step 3: Deploy with Docker

Build the Docker image:

```bash
docker build -t url-shortener-super-powers .
```

Run the container with environment variables:

```bash
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e HOST=0.0.0.0 \
  -e DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE \
  -e PUBLIC_BASE_URL=https://your-domain.example \
  -e SESSION_SECRET=use-a-long-random-production-secret \
  -e IP_HASH_SECRET=use-a-different-long-random-production-secret \
  -e COOKIE_SECURE=true \
  url-shortener-super-powers
```

When the container starts, it runs `prisma migrate deploy` and then starts `node dist/index.js`.

### Step 4: Deploy with Docker Compose

For a single-host deployment, you can adapt `docker-compose.yml`.

Start from the existing compose file, then change these values before production use:

- Replace `SESSION_SECRET` with a strong random value.
- Replace `IP_HASH_SECRET` with a different strong random value.
- Replace `PUBLIC_BASE_URL` with the production domain.
- Set `COOKIE_SECURE` to `true` when using HTTPS.
- Replace the default PostgreSQL username, password, and database if this is not only a private test deployment.
- Ensure the PostgreSQL volume is backed up.

Start the app and database:

```bash
docker compose up --build -d
```

Check container status:

```bash
docker compose ps
```

View logs:

```bash
docker compose logs -f app
```

### Step 5: Deploy Without Docker

If your hosting provider runs Node.js directly, use this flow on the server or in the build pipeline:

```bash
npm ci
npm run build
npx prisma migrate deploy
npm start
```

The `npm start` script runs:

```bash
node dist/index.js
```

Make sure production environment variables are set before running migrations or starting the app.

### Step 6: Configure HTTPS and Reverse Proxy

In production, serve the app over HTTPS. Common setups include:

- A cloud load balancer terminating TLS.
- A platform-managed HTTPS endpoint.
- A reverse proxy such as Nginx, Caddy, or Traefik.

When HTTPS is enabled:

- Set `PUBLIC_BASE_URL` to the `https://` URL.
- Set `COOKIE_SECURE=true` so session cookies are only sent over HTTPS.
- Forward traffic from port 80 or 443 to the app port, usually `3000`.

### Step 7: Run Post-Deployment Checks

After deployment, verify these endpoints:

```text
https://your-domain.example/health
https://your-domain.example/docs
https://your-domain.example/docs/json
```

Then verify the main user flows:

- Create a short link from the public web form.
- Open the generated short URL and confirm it redirects.
- Sign in to the admin area if admin credentials are configured in the database.
- Confirm analytics are recorded after redirects.

### Step 8: Production Maintenance

Before future deployments:

- Run `npm run typecheck`.
- Run `npm test`.
- Run `npm run build`.
- Back up the production database before risky schema changes.

During deployment:

- Apply migrations with `npx prisma migrate deploy`.
- Watch application logs for migration or startup errors.
- Check `/health` after the new version starts.

After deployment:

- Confirm short-link creation and redirects still work.
- Confirm the admin dashboard loads.
- Confirm `PUBLIC_BASE_URL` generates correct public short URLs.
