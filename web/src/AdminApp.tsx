import { FormEvent, useEffect, useState } from "react";

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

type SessionResponse = {
  admin?: Admin;
  message?: string;
};

type OverviewResponse = {
  overview?: Overview;
};

type LinksResponse = {
  links?: AdminLink[];
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
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [links, setLinks] = useState<AdminLink[]>([]);

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
          void loadDashboard();
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

  async function loadDashboard() {
    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const [overviewResponse, linksResponse] = await Promise.all([
        fetch("/api/admin/analytics/overview"),
        fetch("/api/admin/links?page=1&pageSize=5&status=active"),
      ]);
      const [overviewData, linksData] = await Promise.all([
        parseJson(overviewResponse) as Promise<OverviewResponse | null>,
        parseJson(linksResponse) as Promise<LinksResponse | null>,
      ]);

      if (!overviewResponse.ok || !linksResponse.ok) {
        setDashboardError("Unable to load dashboard data.");
        return;
      }

      setOverview(overviewData?.overview ?? emptyOverview);
      setLinks(Array.isArray(linksData?.links) ? linksData.links : []);
    } catch {
      setDashboardError("Unable to load dashboard data.");
    } finally {
      setDashboardLoading(false);
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
      await loadDashboard();
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
      setLinks([]);
      setIsLoggingOut(false);
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

        <section className="admin-overview-grid" aria-label="Overview totals">
          <MetricCard label="Total links" value={overview.totalLinks} />
          <MetricCard label="Total clicks" value={overview.totalClicks} />
          <MetricCard label="Active links" value={overview.activeLinks} />
          <MetricCard label="Recent clicks" value={overview.recentClicks} />
        </section>

        <section className="admin-panel" aria-labelledby="recent-links-title">
          <div className="admin-panel-header">
            <div>
              <p className="admin-kicker">Live preview</p>
              <h2 id="recent-links-title">Recent active links</h2>
            </div>
            {dashboardLoading ? <span className="admin-muted">Refreshing...</span> : null}
          </div>

          {links.length === 0 ? (
            <p className="admin-empty">No active links to preview yet.</p>
          ) : (
            <ul className="admin-link-list">
              {links.map((link) => (
                <li key={link.id}>
                  <div>
                    <strong>{link.shortCode}</strong>
                    <span>{link.originalUrl}</span>
                  </div>
                  <span className="admin-click-count">{formatNumber(link.totalClickCount)} clicks</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </main>
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
