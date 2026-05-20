# M3B Admin Dashboard UI Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a React admin dashboard shell at `/admin/*` with login, current-session loading, logout, and overview cards backed by the existing admin APIs.

**Architecture:** Keep the existing Vite app and Fastify static serving boundary. The React app switches between the public form and admin dashboard based on `window.location.pathname`, and the backend serves the same built app for `/admin/*` without interfering with `/api/*` or redirects. M3B stops at the dashboard shell; detailed charts and full link table interactions remain M3C.

**Tech Stack:** Fastify, TypeScript, React, Vite, Vitest, Testing Library, CSS.

---

## File Structure

- Modify `web/src/App.tsx`: route between the public form and the admin dashboard shell based on the current path.
- Create `web/src/AdminApp.tsx`: admin session loading, login form, overview cards, recent link preview, and logout.
- Modify `web/src/App.test.tsx`: keep public form tests and add admin shell tests.
- Modify `web/src/styles.css`: add admin dashboard shell, login, card, and responsive navigation styles while preserving public form styles.
- Modify `src/public-web.ts`: serve the React shell for `/admin` and `/admin/*` paths.
- Modify `tests/public-web.test.ts`: verify admin deep links serve the frontend shell and `/api/*` still bypasses it.
- Modify `docs/superpowers/plans/implementation-tracker.md`: mark M3B complete and set current plan to this file after verification.

### Task 1: Admin React Shell

**Files:**
- Modify: `web/src/App.tsx`
- Create: `web/src/AdminApp.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/styles.css`

- [ ] **Step 1: Add admin UI tests**

Extend `web/src/App.test.tsx` with tests that render `/admin`, mock authenticated and unauthenticated admin API responses, submit login credentials to `/api/admin/session`, and call logout with `DELETE /api/admin/session`.

- [ ] **Step 2: Implement admin path routing**

Modify `web/src/App.tsx` so `App` returns `<AdminApp />` when `window.location.pathname` is `/admin` or starts with `/admin/`; otherwise it renders the existing public form unchanged.

- [ ] **Step 3: Implement `AdminApp`**

Create `web/src/AdminApp.tsx` with local state for session loading, login form values, auth errors, overview totals, link preview data, and logout. Use existing endpoints:

```text
GET /api/admin/session
POST /api/admin/session
DELETE /api/admin/session
GET /api/admin/analytics/overview
GET /api/admin/links?page=1&pageSize=5&status=active
```

Unauthenticated admins see a polished login panel. Authenticated admins see a sidebar/topbar shell, overview cards for total links, total clicks, active links, and recent clicks, plus a recent active links preview.

- [ ] **Step 4: Style the admin shell**

Add responsive admin styles to `web/src/styles.css`: full-height admin surface, login card, dashboard sidebar, header, overview grid, link preview list, loading and error states, and mobile stacking at narrow widths.

### Task 2: Admin Deep-Link Serving

**Files:**
- Modify: `src/public-web.ts`
- Modify: `tests/public-web.test.ts`

- [ ] **Step 1: Add backend serving tests**

Extend `tests/public-web.test.ts` to verify `GET /admin` and `GET /admin/links` serve `index.html` from `webRoot`, while `GET /api/admin/session` does not serve the shell.

- [ ] **Step 2: Implement admin fallback serving**

Modify `src/public-web.ts` so it registers explicit `GET /` plus `GET /admin` and `GET /admin/*` handlers that send `index.html` when it exists. Keep static asset serving for frontend assets and keep `/api/*` untouched.

### Task 3: Tracker, Final Verification, Merge, Cleanup

**Files:**
- Modify: `docs/superpowers/plans/implementation-tracker.md`

- [ ] **Step 1: Update tracker**

Mark M3B complete and set current plan to `docs/superpowers/plans/2026-05-20-url-shortener-m3b-admin-dashboard-shell.md`.

- [ ] **Step 2: Run end-of-milestone verification only**

Run these commands after all implementation is complete:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 3: Commit, merge into main, and remove worktree**

Commit the M3B changes on `m3b-admin-dashboard-shell`, merge the branch into `main`, then remove `.worktrees/m3b-admin-dashboard-shell` after confirming `main` contains the work.

## Self-Review

- Spec coverage: Implements the first admin dashboard UI milestone from the existing design: login/logout, responsive dashboard shell, overview cards, and basic link preview. Charts and full link table interactions are intentionally left for M3C.
- Placeholder scan: No placeholders, TODOs, or unspecified file paths remain.
- Type consistency: Endpoint paths and response properties match the existing M2A/M2B/M2C admin APIs.
