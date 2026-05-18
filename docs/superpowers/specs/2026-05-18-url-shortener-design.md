# URL Shortener Backend And Admin Dashboard Design

## Summary

Build a production-oriented URL shortener using a Node.js/TypeScript backend, PostgreSQL, and a React/Vite frontend. The service will support public anonymous link creation, short-link redirects, OpenAPI documentation, and a polished admin dashboard with link management and analytics.

The first version uses one deployable application container. PostgreSQL runs as a separate service, including through Docker Compose for local development.

## Goals

- Public users can create short links without logging in.
- Public users can optionally choose a custom alias and optional expiration date.
- The service redirects active, non-expired short links and records human-looking clicks.
- Obvious bots and crawlers do not inflate analytics.
- Admins can log in, manage links, and view analytics charts by day, referrer, and device.
- The public API is documented with OpenAPI.
- The app runs locally with Docker Compose and is deployable as a Docker container.

## Non-Goals For V1

- Public user accounts or link ownership.
- Public metadata endpoints for existing short links.
- Public stats pages.
- Multi-admin management UI.
- Separate domains for dashboard, API, and redirects.
- CAPTCHA or admin-managed denylists.

## Technology Choices

- Backend: Fastify with TypeScript.
- Frontend: React with Vite.
- Database: PostgreSQL.
- Database access and migrations: Prisma.
- Admin authentication: cookie-based server-side sessions.
- Password hashing: Argon2.
- Deployment: Docker app container plus separate PostgreSQL service.

Fastify is preferred over a minimal Express setup because it has strong TypeScript ergonomics, schema-driven validation, OpenAPI-friendly route definitions, and good performance for redirect/API traffic.

## Application Architecture

The repository will contain one full-stack application with clear backend and frontend boundaries:

- `server/`: Fastify API, redirect route, admin auth, OpenAPI docs, PostgreSQL access, validation, rate limiting, and operational endpoints.
- `web/`: React/Vite public form and admin dashboard.
- Docker Compose: local app and PostgreSQL services.

The same app serves public pages, admin pages, API routes, docs, and redirects from one domain.

Routes:

- `/`: public link creation page.
- `/api/links`: public REST endpoint for creating short links.
- `/api/admin/*`: authenticated admin APIs.
- `/docs`: OpenAPI documentation UI.
- `/admin/*`: React admin dashboard.
- `/:code`: short-link redirect route.

Reserved routes such as `admin`, `api`, `docs`, asset paths, and health routes cannot be used as custom aliases. The redirect route is registered so it does not swallow internal application routes.

## Data Model

### `links`

Stores each shortened URL.

Fields:

- `id`: primary key.
- `original_url`: destination URL.
- `short_code`: unique public code or alias.
- `is_custom_alias`: whether the code was user-supplied.
- `is_active`: whether redirects are allowed.
- `expires_at`: optional expiration timestamp.
- `total_click_count`: denormalized count for fast dashboard summaries.
- `created_at`: creation timestamp.
- `updated_at`: update timestamp.

### `click_events`

Stores analytics events for counted clicks.

Fields:

- `id`: primary key.
- `link_id`: foreign key to `links`.
- `clicked_at`: event timestamp.
- `referrer_host`: normalized referrer host when available.
- `device_type`: coarse device category such as desktop, mobile, tablet, or unknown.
- `browser`: coarse browser/user-agent summary.
- `ip_hash`: irreversible hash or equivalent privacy-preserving representation.

Raw full IP addresses are not stored in click analytics.

### `admin_users`

Stores admin login identities.

Fields:

- `id`: primary key.
- `email`: unique admin email.
- `password_hash`: Argon2 password hash.
- `created_at`: creation timestamp.
- `last_login_at`: optional last login timestamp.

The initial admin is created through a setup or seed command. V1 does not include public registration or admin user management screens.

### `admin_sessions`

Stores server-side admin sessions.

Fields:

- `id`: primary key.
- `admin_user_id`: foreign key to `admin_users`.
- `session_token_hash`: hash of the browser session token.
- `expires_at`: session expiration timestamp.
- `created_at`: creation timestamp.

## Public Link Creation

Public users can create links through both the web form and `POST /api/links`.

Request fields:

- `url`: required destination URL.
- `alias`: optional custom alias.
- `expiresAt`: optional expiration timestamp.

Validation rules:

- Destination URLs must use `http` or `https`.
- Localhost, private IP ranges, loopback addresses, and internal hostnames are blocked.
- Aliases must be URL-safe, length-limited, unique, and not reserved.
- Public creation is rate-limited by IP.

If no alias is provided, the backend generates a random URL-safe code and retries on uniqueness collisions. If a custom alias collides or fails validation, the API returns a clear validation error instead of silently replacing it.

Successful responses include the generated short URL based on the configured public base URL.

## Redirect Behavior

When a user visits `/:code`, the service:

1. Looks up the link by short code.
2. Verifies the link exists, is active, and is not expired.
3. Shows a branded unavailable page for missing, inactive, or expired links.
4. Redirects valid links to their original URL.
5. Records click analytics for human-looking visits.

Obvious bots and crawlers are redirected but not counted. Click recording should avoid adding noticeable latency to redirects. The dashboard uses `links.total_click_count` for fast summaries and `click_events` for detailed charts.

## Public API

V1 exposes only the public API needed for anonymous link creation.

- `POST /api/links`: create a short link.

V1 does not expose `GET /api/links/:code` or other public metadata endpoints. Visitors use `GET /:code` for redirects, and admins use authenticated admin APIs for link metadata.

## Admin Dashboard

The admin dashboard is a custom polished SaaS analytics interface built with React/Vite and served under `/admin/*`.

V1 features:

- Admin login and logout.
- Overview cards for total links, total clicks, active links, and recent clicks.
- Analytics charts by day, referrer, and device.
- Search, filter, and paginate all links.
- View link details and click history.
- Edit original URL, active status, and expiration date.
- Delete or deactivate links.
- Copy short URLs from the dashboard.

The visual direction should be clean and analytics-focused: crisp cards, strong typography, responsive charts, polished empty/loading states, and a restrained palette with one strong accent color.

## Admin API

Admin APIs live under `/api/admin/*` and require an authenticated session.

Expected endpoint groups:

- Session endpoints for login, logout, and current admin.
- Link listing, searching, filtering, pagination, update, deletion, and deactivation.
- Link detail and click history endpoints.
- Analytics endpoints for time-series clicks, referrer breakdowns, and device breakdowns.

Admin requests without a valid session return `401`. Validation errors return structured JSON responses with stable error codes and readable messages.

## Authentication And Sessions

Admin login uses database-backed admin users and server-side sessions.

Session cookie behavior:

- `HttpOnly` to prevent JavaScript access.
- `SameSite=Lax` for same-domain dashboard usage.
- `Secure` in production.
- Session token stored only as a hash in the database.
- Expired sessions are rejected and can be cleaned up periodically.

This avoids JWT storage complexity and fits the same-domain deployment model.

## Error Handling

Public and admin APIs return consistent JSON errors with stable codes and human-readable messages. The public form renders these errors inline.

Redirect errors use branded HTML pages rather than JSON:

- Unknown short code.
- Inactive link.
- Expired link.

Operational errors should be logged server-side without leaking secrets or sensitive request data to users.

## Security And Abuse Protection

Security requirements:

- Rate-limit public link creation by IP.
- Validate and normalize destination URLs.
- Block private network, loopback, localhost, and internal destinations.
- Reject unsafe or reserved aliases.
- Use Argon2 for admin passwords.
- Use secure cookie settings in production.
- Store hashed or privacy-preserving IP metadata for analytics rather than raw full IP addresses.
- Avoid logging secrets, session tokens, or full sensitive request bodies.

V1 does not include CAPTCHA or admin-managed denylists, but the design leaves room to add them later.

## Configuration

Environment variables configure:

- App port.
- Database URL.
- Public base URL used when generating short links.
- Session secret or token signing material.
- Cookie secure mode.
- Rate limit settings.
- Optional log level.

The app assumes one base domain in v1, but the public base URL remains configurable so a dedicated short-link domain can be introduced later.

## Operations

Local development uses Docker Compose with at least:

- App service.
- PostgreSQL service.

Operational endpoints:

- Health endpoint for container checks.
- OpenAPI documentation at `/docs`.

Database migrations manage schema changes. Seed or setup commands create the initial admin user.

## Testing Strategy

Unit tests cover:

- Random short code generation and collision retry behavior.
- Alias validation and reserved alias rejection.
- URL validation and private network blocking.
- Bot detection.
- Expiration and active-status checks.

API tests cover:

- Public link creation.
- Validation and rate-limit errors.
- Redirect behavior for valid, missing, inactive, expired, and bot visits.
- Admin login/logout/session checks.
- Admin link search, edit, delete/deactivate, and analytics endpoints.

UI tests cover:

- Public form success and error states.
- Admin login.
- Dashboard overview rendering.
- Basic link table interactions.

## Implementation Notes

- Keep the public API surface small in v1: only public link creation is exposed as JSON.
- Keep redirect logic separate from dashboard/API logic so it remains easy to test and optimize.
- Keep analytics aggregation behind admin API endpoints so chart implementation can change without affecting stored data.
- Prefer explicit route schemas to support validation and OpenAPI generation.
