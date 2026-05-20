import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

type Admin = {
  id?: string;
  email: string;
};

type Overview = {
  totalLinks: number;
  totalClicks: number;
  activeLinks: number;
  recentClicks: number;
};

type AdminLink = {
  id: string;
  originalUrl: string;
  shortCode: string;
  isActive: boolean;
  expiresAt: string | null;
  totalClickCount: number;
  createdAt: string;
  updatedAt: string;
};

type AnalyticsDay = {
  date: string;
  clicks: number;
};

type AnalyticsReferrer = {
  referrer: string;
  clicks: number;
};

type AnalyticsDevice = {
  deviceType: string;
  clicks: number;
};

type Pagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

type LinkStatusFilter = "all" | "active" | "inactive";

type SessionResponse = {
  admin?: Admin;
  message?: string;
};

type OverviewResponse = {
  overview?: Overview;
};

type LinksResponse = {
  links?: AdminLink[];
  pagination?: Pagination;
};

type ClicksByDayResponse = {
  days?: AnalyticsDay[];
};

type ReferrersResponse = {
  referrers?: AnalyticsReferrer[];
};

type DevicesResponse = {
  devices?: AnalyticsDevice[];
};

const emptyOverview: Overview = {
  totalLinks: 0,
  totalClicks: 0,
  activeLinks: 0,
  recentClicks: 0,
};

export function AdminApp() {
  const currentPath = window.location.pathname;
  const [sessionLoading, setSessionLoading] = useState(true);
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [days, setDays] = useState<AnalyticsDay[]>([]);
  const [referrers, setReferrers] = useState<AnalyticsReferrer[]>([]);
  const [devices, setDevices] = useState<AnalyticsDevice[]>([]);
  const [links, setLinks] = useState<AdminLink[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [status, setStatus] = useState<LinkStatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, totalItems: 0, totalPages: 1 });
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const latestLinksRequest = useRef("");

  useEffect(() => {
    let isCurrent = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/admin/session");
        const data = (await parseJson(response)) as SessionResponse | null;
        if (!isCurrent) {
          return;
        }
        if (response.ok && data?.admin !== undefined) {
          setAdmin(data.admin);
        } else {
          setAdmin(null);
        }
      } catch {
        if (isCurrent) {
          setAdmin(null);
          setAuthError("Unable to check the admin session. Please sign in.");
        }
      } finally {
        if (isCurrent) {
          setSessionLoading(false);
        }
      }
    }

    void loadSession();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (admin === null) {
      return;
    }

    void loadDashboard();
  }, [admin]);

  useEffect(() => {
    if (admin === null) {
      return;
    }

    void loadLinks();
  }, [admin, page, pageSize, status, q]);

  async function loadDashboard() {
    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const [overviewResponse, daysResponse, referrersResponse, devicesResponse] = await Promise.all([
        fetch("/api/admin/analytics/overview"),
        fetch("/api/admin/analytics/clicks-by-day"),
        fetch("/api/admin/analytics/referrers"),
        fetch("/api/admin/analytics/devices"),
      ]);
      const [overviewData, daysData, referrersData, devicesData] = await Promise.all([
        parseJson(overviewResponse) as Promise<OverviewResponse | null>,
        parseJson(daysResponse) as Promise<ClicksByDayResponse | null>,
        parseJson(referrersResponse) as Promise<ReferrersResponse | null>,
        parseJson(devicesResponse) as Promise<DevicesResponse | null>,
      ]);

      if (!overviewResponse.ok) {
        setDashboardError("Unable to load dashboard data.");
        return;
      }

      if (!daysResponse.ok || !referrersResponse.ok || !devicesResponse.ok) {
        setDashboardError("Some analytics charts could not be loaded.");
      }

      setOverview(overviewData?.overview ?? emptyOverview);
      setDays(daysResponse.ok && Array.isArray(daysData?.days) ? daysData.days : []);
      setReferrers(referrersResponse.ok && Array.isArray(referrersData?.referrers) ? referrersData.referrers : []);
      setDevices(devicesResponse.ok && Array.isArray(devicesData?.devices) ? devicesData.devices : []);
    } catch {
      setDashboardError("Unable to load dashboard data.");
    } finally {
      setDashboardLoading(false);
    }
  }

  async function loadLinks() {
    setTableLoading(true);
    setTableError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("status", status);
    if (q !== "") {
      params.set("q", q);
    }
    const requestKey = params.toString();
    latestLinksRequest.current = requestKey;

    try {
      const response = await fetch(`/api/admin/links?${requestKey}`);
      const data = (await parseJson(response)) as LinksResponse | null;
      if (latestLinksRequest.current !== requestKey) {
        return;
      }
      if (!response.ok) {
        setTableError("Unable to load links.");
        return;
      }

      const nextPagination = data?.pagination ?? { page, pageSize, totalItems: data?.links?.length ?? 0, totalPages: 1 };
      setLinks(Array.isArray(data?.links) ? data.links : []);
      setPagination({ ...nextPagination, totalPages: Math.max(1, nextPagination.totalPages) });
    } catch {
      if (latestLinksRequest.current === requestKey) {
        setTableError("Unable to load links.");
      }
    } finally {
      if (latestLinksRequest.current === requestKey) {
        setTableLoading(false);
      }
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await parseJson(response)) as SessionResponse | null;

      if (!response.ok) {
        setAuthError(readApiMessage(data, "Invalid email or password."));
        return;
      }

      setPassword("");
      setAdmin({ email });
    } catch {
      setAuthError("Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } finally {
      setAdmin(null);
      setOverview(emptyOverview);
      setDays([]);
      setReferrers([]);
      setDevices([]);
      setLinks([]);
      latestLinksRequest.current = "";
      setPagination({ page: 1, pageSize, totalItems: 0, totalPages: 1 });
      setIsLoggingOut(false);
    }
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQ(searchInput.trim());
  }

  function handleStatusChange(nextStatus: LinkStatusFilter) {
    setPage(1);
    setStatus(nextStatus);
  }

  async function handleCopy(shortCode: string) {
    const shortUrl = `${window.location.origin}/${shortCode}`;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopiedCode(shortCode);
    } catch {
      setCopiedCode(null);
    }
  }

  if (sessionLoading) {
    return (
      <main className="admin-app admin-loading" aria-live="polite">
        <div className="admin-spinner" />
        <p>Checking admin session...</p>
      </main>
    );
  }

  if (admin === null) {
    return (
      <main className="admin-app admin-login-page">
        <section className="admin-login-card" aria-labelledby="admin-login-title">
          <p className="admin-kicker">URL shortener control room</p>
          <h1 id="admin-login-title">Admin sign in</h1>
          <p className="admin-login-copy">Monitor link volume, click activity, and active campaigns from one focused workspace.</p>

          <form className="admin-login-form" onSubmit={handleLogin}>
            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {authError !== null ? (
            <div className="admin-alert" role="alert">
              {authError}
            </div>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-app admin-dashboard-shell">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <div>
          <p className="admin-logo">ShortOps</p>
          <p className="admin-sidebar-copy">Analytics and link health</p>
        </div>
        <nav>
          <a href="/admin" aria-current={currentPath === "/admin" ? "page" : undefined}>
            Overview
          </a>
          <a href="/admin/links" aria-current={currentPath.startsWith("/admin/links") ? "page" : undefined}>
            Links
          </a>
        </nav>
      </aside>

      <section className="admin-dashboard-main" aria-labelledby="admin-dashboard-title">
        <header className="admin-topbar">
          <div>
            <p className="admin-kicker">
              Signed in as <span>{admin.email}</span>
            </p>
            <h1 id="admin-dashboard-title">Admin dashboard</h1>
          </div>
          <button className="secondary-button" type="button" onClick={handleLogout} disabled={isLoggingOut}>
            {isLoggingOut ? "Logging out..." : "Log out"}
          </button>
        </header>

        {dashboardError !== null ? (
          <div className="admin-alert" role="alert">
            {dashboardError}
          </div>
        ) : null}

        {dashboardLoading ? (
          <p className="admin-loading-note" aria-live="polite">
            Loading dashboard analytics...
          </p>
        ) : null}

        <section className="admin-overview-grid" aria-label="Overview totals">
          <MetricCard label="Total links" value={overview.totalLinks} />
          <MetricCard label="Total clicks" value={overview.totalClicks} />
          <MetricCard label="Active links" value={overview.activeLinks} />
          <MetricCard label="Recent clicks" value={overview.recentClicks} />
        </section>

        <section className="admin-chart-grid" aria-label="Analytics charts">
          <ChartPanel title="Daily clicks" kicker="Traffic" emptyMessage="No click activity yet." hasData={days.length > 0}>
            <BarList items={days.map((day) => ({ label: day.date, value: day.clicks }))} valueSuffix="clicks" />
          </ChartPanel>

          <ChartPanel title="Top referrers" kicker="Sources" emptyMessage="No referrer data yet." hasData={referrers.length > 0}>
            <BarList items={referrers.map((referrer) => ({ label: referrer.referrer, value: referrer.clicks }))} valueSuffix="clicks" />
          </ChartPanel>

          <ChartPanel title="Devices" kicker="Audience" emptyMessage="No device data yet." hasData={devices.length > 0}>
            <BarList items={devices.map((device) => ({ label: device.deviceType, value: device.clicks }))} valueSuffix="clicks" />
          </ChartPanel>
        </section>

        <section className="admin-panel" aria-labelledby="all-links-title">
          <div className="admin-panel-header">
            <div>
              <p className="admin-kicker">Inventory</p>
              <h2 id="all-links-title">All links</h2>
            </div>
            {dashboardLoading || tableLoading ? <span className="admin-muted">Refreshing...</span> : null}
          </div>

          <form className="admin-table-controls" onSubmit={handleSearchSubmit}>
            <label className="field admin-search-field">
              <span>Search links</span>
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search short code or URL" />
            </label>
            <label className="field admin-status-field">
              <span>Status</span>
              <select value={status} onChange={(event) => handleStatusChange(event.target.value as LinkStatusFilter)}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <button className="secondary-button" type="submit">
              Search
            </button>
          </form>

          {tableError !== null ? (
            <div className="admin-alert" role="alert">
              {tableError}
            </div>
          ) : null}

          {links.length === 0 ? (
            <p className="admin-empty">No links match the current filters.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-links-table">
                <thead>
                  <tr>
                    <th scope="col">Short code</th>
                    <th scope="col">Destination URL</th>
                    <th scope="col">Status</th>
                    <th scope="col">Clicks</th>
                    <th scope="col">Expiration</th>
                    <th scope="col">Created</th>
                    <th scope="col">Copy</th>
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr key={link.id}>
                      <td data-label="Short code">{link.shortCode}</td>
                      <td data-label="Destination URL">
                        <a href={link.originalUrl}>{link.originalUrl}</a>
                      </td>
                      <td data-label="Status">
                        <span className={`admin-status-pill ${link.isActive ? "is-active" : "is-inactive"}`}>
                          {link.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td data-label="Clicks">{formatNumber(link.totalClickCount)}</td>
                      <td data-label="Expiration">{formatDate(link.expiresAt, "No expiration")}</td>
                      <td data-label="Created">{formatDate(link.createdAt, "Unknown")}</td>
                      <td data-label="Copy">
                        <button className="admin-copy-button" type="button" onClick={() => void handleCopy(link.shortCode)}>
                          {copiedCode === link.shortCode ? "Copied" : `Copy ${link.shortCode}`}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="admin-pagination" aria-label="Link pagination">
            <span>
              Page {pagination.page} of {pagination.totalPages} - {formatNumber(pagination.totalItems)} links
            </span>
            <div>
              <button className="secondary-button" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                Previous
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                disabled={page >= pagination.totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function ChartPanel({
  title,
  kicker,
  emptyMessage,
  hasData,
  children,
}: {
  title: string;
  kicker: string;
  emptyMessage: string;
  hasData: boolean;
  children: ReactNode;
}) {
  return (
    <section className="admin-panel admin-chart-panel" aria-labelledby={`${title.toLowerCase().replace(/\s+/g, "-")}-title`}>
      <div className="admin-panel-header">
        <div>
          <p className="admin-kicker">{kicker}</p>
          <h2 id={`${title.toLowerCase().replace(/\s+/g, "-")}-title`}>{title}</h2>
        </div>
      </div>
      {hasData ? children : <p className="admin-empty">{emptyMessage}</p>}
    </section>
  );
}

function BarList({ items, valueSuffix }: { items: { label: string; value: number }[]; valueSuffix: string }) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className="admin-bar-list">
      {items.map((item) => (
        <li key={item.label}>
          <div className="admin-bar-row">
            <span>{item.label}</span>
            <strong>
              {formatNumber(item.value)} {valueSuffix}
            </strong>
          </div>
          <div className="admin-bar-track" aria-hidden="true">
            <span style={{ width: `${Math.max(4, (item.value / maxValue) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="admin-metric-card">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </article>
  );
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readApiMessage(data: SessionResponse | null, fallback: string): string {
  return typeof data?.message === "string" && data.message !== "" ? data.message : fallback;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string | null, fallback: string): string {
  if (value === null || value === "") {
    return fallback;
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
