# M3A Public React Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the public React/Vite landing page at `/` so anonymous visitors can create short links with optional aliases and expiration dates.

**Architecture:** Keep the existing Fastify API as the backend boundary and add a focused `web/` React app for the public form. The backend serves the built Vite assets from `dist/web` and keeps `/api/*`, `/health`, admin APIs, and short-link redirects separate.

**Tech Stack:** Fastify, TypeScript, React, Vite, Vitest, Testing Library, `@fastify/static`.

---

## File Structure

- Modify `package.json` and `package-lock.json` to add React, Vite, static serving, and UI test tooling, plus build scripts for backend and frontend.
- Create `web/index.html`, `web/tsconfig.json`, `web/vite.config.ts`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/App.test.tsx`, and `web/src/styles.css` for the public form.
- Create `src/public-web.ts` to serve built frontend assets.
- Modify `src/server.ts` to register public web serving before redirect routes.
- Create `tests/public-web.test.ts` to verify `/` serves the built public page without interfering with API routes.
- Modify `docs/superpowers/plans/implementation-tracker.md` to mark M3A complete after implementation and verification.

### Task 1: Frontend Tooling And Public Form

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `web/index.html`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/src/main.tsx`
- Create: `web/src/App.tsx`
- Create: `web/src/App.test.tsx`
- Create: `web/src/styles.css`

- [ ] **Step 1: Add dependencies and scripts**

Run: `npm install @vitejs/plugin-react vite react react-dom @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @types/react @types/react-dom --save-dev`

Then adjust `package.json` scripts so they include:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "dev:web": "vite --config web/vite.config.ts --host 0.0.0.0",
    "postinstall": "prisma generate",
    "prebuild": "node -e \"fs.rmSync('dist', { recursive: true, force: true })\"",
    "build": "npm run build:server && npm run build:web",
    "build:server": "tsc -p tsconfig.build.json",
    "build:web": "vite build --config web/vite.config.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p web/tsconfig.json --noEmit",
    "start": "node dist/index.js",
    "test": "vitest run --exclude dist/**",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio"
  }
}
```

- [ ] **Step 2: Add the web project shell**

Create `web/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Shorten a URL</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

Create `web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

Create `web/src/test-setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Create `web/src/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 3: Write public form tests**

Create `web/src/App.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("creates a short link from the public form", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          shortUrl: "https://sho.rt/launch",
          shortCode: "launch",
          url: "https://example.com",
          isCustomAlias: true,
          expiresAt: null,
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      ),
    );

    render(<App />);
    await userEvent.type(screen.getByLabelText(/destination url/i), "https://example.com");
    await userEvent.type(screen.getByLabelText(/custom alias/i), "launch");
    await userEvent.click(screen.getByRole("button", { name: /create short link/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/links", expect.any(Object)));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      url: "https://example.com",
      alias: "launch",
    });
    expect(await screen.findByRole("link", { name: "https://sho.rt/launch" })).toBeInTheDocument();
  });

  it("shows API validation errors inline", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "INVALID_URL", message: "URL must use http or https." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<App />);
    await userEvent.type(screen.getByLabelText(/destination url/i), "ftp://example.com");
    await userEvent.click(screen.getByRole("button", { name: /create short link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("URL must use http or https.");
  });
});
```

- [ ] **Step 4: Implement the public form**

Create `web/src/App.tsx` with a controlled form that posts to `/api/links`, includes `url`, optional trimmed `alias`, optional `expiresAt`, shows loading text while submitting, renders API error messages in `role="alert"`, and renders the returned `shortUrl` as a copyable link.

- [ ] **Step 5: Style the public page**

Create `web/src/styles.css` with a responsive polished landing-page layout, clear focus styles, inline form spacing, success and error states, and mobile-friendly width constraints.

### Task 2: Fastify Static Serving For The Public Page

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/public-web.ts`
- Modify: `src/server.ts`
- Create: `tests/public-web.test.ts`

- [ ] **Step 1: Add static serving dependency**

Run: `npm install @fastify/static`

- [ ] **Step 2: Write backend serving tests**

Create `tests/public-web.test.ts`:

```ts
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import type { DatabaseClient } from "../src/db.js";

function createDbStub(): DatabaseClient {
  return {
    link: {
      create: async () => {
        throw new Error("link.create should not be called");
      },
      findUnique: async () => null,
      update: async () => ({}),
    },
    clickEvent: {
      create: async () => ({}),
    },
    adminUser: {
      findUnique: async () => null,
      update: async () => ({}),
    },
    adminSession: {
      create: async () => ({ id: "session_1", expiresAt: new Date() }),
      findUnique: async () => null,
      deleteMany: async () => ({ count: 0 }),
    },
    $queryRaw: async () => [],
    $disconnect: async () => {},
  };
}

describe("public web serving", () => {
  it("serves the public React shell at root", async () => {
    const webRoot = await mkdtemp(join(tmpdir(), "shortener-web-"));
    await writeFile(join(webRoot, "index.html"), "<!doctype html><title>Public Form</title>");
    const app = buildServer({
      logger: false,
      prisma: createDbStub(),
      publicBaseUrl: "https://sho.rt",
      ipHashSecret: "test-secret",
      sessionSecret: "test-session-secret",
      webRoot,
    });

    try {
      const response = await app.inject({ method: "GET", url: "/" });
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.body).toContain("Public Form");
    } finally {
      await app.close();
    }
  });

  it("keeps API routes ahead of the public web shell", async () => {
    const webRoot = await mkdtemp(join(tmpdir(), "shortener-web-"));
    await writeFile(join(webRoot, "index.html"), "<!doctype html><title>Public Form</title>");
    const app = buildServer({
      logger: false,
      prisma: createDbStub(),
      publicBaseUrl: "https://sho.rt",
      ipHashSecret: "test-secret",
      sessionSecret: "test-session-secret",
      webRoot,
    });

    try {
      const response = await app.inject({ method: "GET", url: "/api/links" });
      expect(response.statusCode).not.toBe(200);
      expect(response.body).not.toContain("Public Form");
    } finally {
      await app.close();
    }
  });
});
```

- [ ] **Step 3: Implement static web serving**

Create `src/public-web.ts` that registers `@fastify/static` for the provided `webRoot`, serves `/` with `index.html`, and does nothing if no web root is available. Use `existsSync` so tests and development can build the server without a frontend build.

- [ ] **Step 4: Register public web serving before redirects**

Modify `src/server.ts` so `ServerOptions` accepts `webRoot?: string`, registers `publicWebRoutes` after `/health` and before `redirectRoutes`, and keeps `/api/*` untouched.

### Task 3: Tracker, Final Verification, Merge, Cleanup

**Files:**
- Modify: `docs/superpowers/plans/implementation-tracker.md`

- [ ] **Step 1: Mark M3A complete in tracker**

Update `docs/superpowers/plans/implementation-tracker.md`:

```md
- [x] M3A: Public React form
```

Set current plan to:

```md
- Current plan: `docs/superpowers/plans/2026-05-19-url-shortener-m3a-public-react-form.md`
```

- [ ] **Step 2: Run end-of-milestone verification only**

Run these commands after all implementation is complete:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 3: Commit, merge into main, and remove worktree**

Commit the M3A changes on `m3a-public-react-form`, merge the branch into `main`, then remove `.worktrees/m3a-public-react-form` after confirming `main` contains the work.
