# M3C Dashboard Charts And Link Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the admin dashboard UI with analytics charts and a searchable, filterable, paginated link table backed by the existing admin APIs.

**Architecture:** Extend the existing single-file `AdminApp` dashboard rather than introducing routing or state libraries. Authenticated admins load overview totals, chart data, and link data from the M2B/M2C APIs; the React UI keeps query/filter/page state locally and refetches table data when those controls change.

**Tech Stack:** Fastify, TypeScript, React, Vite, Vitest, Testing Library, CSS.

---

## File Structure

- Modify `web/src/AdminApp.tsx`: add analytics response types, chart data loading, link table state, search/filter/pagination controls, copy-short-link action, and responsive chart/table rendering.
- Modify `web/src/App.test.tsx`: add admin tests for chart rendering, table search/filter pagination, and copy action.
- Modify `web/src/styles.css`: style chart panels, horizontal bar charts, compact line-ish daily chart, table controls, status pills, pagination, and mobile table cards.
- Modify `docs/superpowers/plans/implementation-tracker.md`: mark M3C complete and set this plan as the current plan.

### Task 1: Admin Charts And Link Table

**Files:**
- Modify: `web/src/AdminApp.tsx`
- Modify: `web/src/App.test.tsx`
- Modify: `web/src/styles.css`

- [ ] **Step 1: Add UI coverage for M3C**

Extend `web/src/App.test.tsx` with tests that authenticate an admin, mock these endpoints, and verify visible chart/table behavior:

```text
GET /api/admin/analytics/overview
GET /api/admin/analytics/clicks-by-day
GET /api/admin/analytics/referrers
GET /api/admin/analytics/devices
GET /api/admin/links?page=1&pageSize=5&status=active
GET /api/admin/links?page=1&pageSize=10&status=all&q=docs
GET /api/admin/links?page=2&pageSize=10&status=all&q=docs
```

The tests should assert that the dashboard renders daily clicks, referrer/device breakdowns, table rows, search and status controls, pagination metadata, and a copy button that writes the short URL to `navigator.clipboard.writeText`.

- [ ] **Step 2: Implement dashboard data loading**

Update `AdminApp` so authenticated admins load overview, clicks-by-day, referrers, devices, and links. Keep the initial recent active links query compatible with M3B, then load the full table with local state:

```text
page: 1
pageSize: 10
status: all | active | inactive
q: trimmed search string
```

- [ ] **Step 3: Render charts and table**

Add three analytics panels after the overview cards:

- Daily clicks with proportional bars and exact click counts.
- Top referrers with `Direct` displayed when the API returns that label.
- Devices with proportional bars and device labels.

Replace the preview list with an all-links table containing short code, destination, status, clicks, expiration, created date, and a copy action.

- [ ] **Step 4: Add responsive styles**

Extend `styles.css` with dashboard chart and table styles that match the existing dashboard visual language and remain usable on mobile.

### Task 2: Tracker, Final Verification, Merge, Cleanup

**Files:**
- Modify: `docs/superpowers/plans/implementation-tracker.md`

- [ ] **Step 1: Update tracker**

Mark M3C complete and set current plan to `docs/superpowers/plans/2026-05-20-url-shortener-m3c-dashboard-charts-link-table.md`.

- [ ] **Step 2: Run end-of-milestone verification only**

Run these commands after all implementation is complete:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 3: Commit, merge into main, and remove worktree**

Commit the M3C changes on `m3c-dashboard-charts-link-table`, merge the branch into `main`, then remove `.worktrees/m3c-dashboard-charts-link-table` after confirming `main` contains the work.

## Self-Review

- Spec coverage: Implements the dashboard charts by day/referrer/device, search/filter/pagination for all links, and copy short URLs from the Admin Dashboard section of the design spec.
- Placeholder scan: No placeholders, TODOs, or unspecified file paths remain.
- Type consistency: Endpoint paths and response shapes match the implemented M2B/M2C admin APIs and existing M3B admin dashboard types.
