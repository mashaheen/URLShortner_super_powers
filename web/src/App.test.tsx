// @vitest-environment jsdom
import "./test-setup";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const rootUrl = "/";

beforeEach(() => {
  window.history.pushState({}, "", rootUrl);
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", rootUrl);
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
    await userEvent.type(screen.getByLabelText(/custom alias/i), " launch ");
    await userEvent.click(screen.getByRole("button", { name: /create short link/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/links", expect.any(Object)));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      url: "https://example.com",
      alias: "launch",
    });
    expect(await screen.findByRole("link", { name: "https://sho.rt/launch" })).toHaveAttribute(
      "href",
      "https://sho.rt/launch",
    );
    expect(screen.getByRole("button", { name: /copy short link/i })).toBeInTheDocument();
  });

  it("omits empty optional fields from the submit payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ shortUrl: "https://sho.rt/abc123" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    render(<App />);
    await userEvent.type(screen.getByLabelText(/destination url/i), "https://example.com/empty-options");
    await userEvent.type(screen.getByLabelText(/custom alias/i), "   ");
    await userEvent.click(screen.getByRole("button", { name: /create short link/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      url: "https://example.com/empty-options",
    });
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

  it("shows a readable fallback error when the API returns malformed JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not json", { status: 500, headers: { "content-type": "text/plain" } }),
    );

    render(<App />);
    await userEvent.type(screen.getByLabelText(/destination url/i), "https://example.com");
    await userEvent.click(screen.getByRole("button", { name: /create short link/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to create link. Please try again.");
  });

  it("renders the admin login at /admin and submits credentials", async () => {
    window.history.pushState({}, "", "/admin");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/admin/session" && init?.method === "POST") {
        return new Response(null, { status: 204 });
      }
      if (url === "/api/admin/session") {
        return new Response(JSON.stringify({ code: "UNAUTHENTICATED", message: "Admin session is required." }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "/api/admin/analytics/overview") {
        return new Response(
          JSON.stringify({ overview: { totalLinks: 12, totalClicks: 345, activeLinks: 9, recentClicks: 21 } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url === "/api/admin/links?page=1&pageSize=10&status=all") {
        return new Response(
          JSON.stringify({
            links: [
              {
                id: "link-1",
                originalUrl: "https://example.com/campaign",
                shortCode: "campaign",
                isActive: true,
                expiresAt: null,
                totalClickCount: 88,
                createdAt: "2026-05-20T10:00:00.000Z",
                updatedAt: "2026-05-20T10:00:00.000Z",
              },
            ],
            pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(null, { status: 404 });
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: /admin sign in/i })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/email address/i), "admin@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "correct horse battery staple");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/session",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "admin@example.com", password: "correct horse battery staple" }),
        }),
      ),
    );
    expect(await screen.findByRole("heading", { name: /admin dashboard/i })).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("campaign")).toBeInTheDocument();
  });

  it("renders an authenticated admin dashboard and logs out", async () => {
    window.history.pushState({}, "", "/admin/links");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/admin/session" && init?.method === "DELETE") {
        return new Response(null, { status: 204 });
      }
      if (url === "/api/admin/session") {
        return new Response(JSON.stringify({ admin: { id: "admin-1", email: "admin@example.com" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "/api/admin/analytics/overview") {
        return new Response(
          JSON.stringify({ overview: { totalLinks: 42, totalClicks: 1200, activeLinks: 37, recentClicks: 64 } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url === "/api/admin/analytics/clicks-by-day") {
        return jsonResponse({ days: [] });
      }
      if (url === "/api/admin/analytics/referrers") {
        return jsonResponse({ referrers: [] });
      }
      if (url === "/api/admin/analytics/devices") {
        return jsonResponse({ devices: [] });
      }
      if (url === "/api/admin/links?page=1&pageSize=10&status=all") {
        return new Response(
          JSON.stringify({
            links: [
              {
                id: "link-1",
                originalUrl: "https://example.com/product-launch",
                shortCode: "launch",
                isActive: true,
                expiresAt: null,
                totalClickCount: 311,
                createdAt: "2026-05-20T10:00:00.000Z",
                updatedAt: "2026-05-20T10:00:00.000Z",
              },
            ],
            pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(null, { status: 404 });
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: /admin dashboard/i })).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    expect(await screen.findByText("1,200")).toBeInTheDocument();
    expect(await screen.findByText("launch")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /overview/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /links/i })).toHaveAttribute("aria-current", "page");

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/session", expect.objectContaining({ method: "DELETE" })),
    );
    expect(await screen.findByRole("heading", { name: /admin sign in/i })).toBeInTheDocument();
  });

  it("renders admin analytics charts and all-links table", async () => {
    window.history.pushState({}, "", "/admin");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "/api/admin/session") {
        return new Response(JSON.stringify({ admin: { id: "admin-1", email: "admin@example.com" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "/api/admin/analytics/overview") {
        return jsonResponse({ overview: { totalLinks: 21, totalClicks: 809, activeLinks: 18, recentClicks: 44 } });
      }
      if (url === "/api/admin/analytics/clicks-by-day") {
        return jsonResponse({
          days: [
            { date: "2026-05-18", clicks: 14 },
            { date: "2026-05-19", clicks: 31 },
          ],
        });
      }
      if (url === "/api/admin/analytics/referrers") {
        return jsonResponse({ referrers: [{ referrer: "Direct", clicks: 52 }] });
      }
      if (url === "/api/admin/analytics/devices") {
        return jsonResponse({ devices: [{ deviceType: "mobile", clicks: 47 }] });
      }
      if (url === "/api/admin/links?page=1&pageSize=10&status=all") {
        return jsonResponse({
          links: [
            adminLink({
              id: "docs-link",
              originalUrl: "https://example.com/docs",
              shortCode: "docs",
              totalClickCount: 73,
              expiresAt: "2026-06-01T00:00:00.000Z",
            }),
          ],
          pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
        });
      }
      return new Response(null, { status: 404 });
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: /admin dashboard/i })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /daily clicks/i })).toBeInTheDocument();
    expect(screen.getByText("2026-05-19")).toBeInTheDocument();
    expect(screen.getByText("31 clicks")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /top referrers/i })).toBeInTheDocument();
    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /devices/i })).toBeInTheDocument();
    expect(screen.getByText("mobile")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /all links/i })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /short code/i })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "docs" })).toBeInTheDocument();
    expect(screen.getByText("73")).toBeInTheDocument();
    expect(screen.getByText(/page 1 of 1/i)).toBeInTheDocument();
  });

  it("shows dashboard loading, chart error, and empty states", async () => {
    window.history.pushState({}, "", "/admin");
    let resolveOverview: (response: Response) => void = () => {};
    const overviewPromise = new Promise<Response>((resolve) => {
      resolveOverview = resolve;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/admin/session") {
        return jsonResponse({ admin: { id: "admin-1", email: "admin@example.com" } });
      }
      if (url === "/api/admin/analytics/overview") {
        return overviewPromise;
      }
      if (url === "/api/admin/analytics/clicks-by-day") {
        return new Response(JSON.stringify({ message: "failed" }), { status: 500, headers: { "content-type": "application/json" } });
      }
      if (url === "/api/admin/analytics/referrers") {
        return jsonResponse({ referrers: [] });
      }
      if (url === "/api/admin/analytics/devices") {
        return jsonResponse({ devices: [] });
      }
      if (url === "/api/admin/links?page=1&pageSize=10&status=all") {
        return jsonResponse({ links: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 } });
      }
      return new Response(null, { status: 404 });
    });

    render(<App />);

    expect(await screen.findByText(/loading dashboard analytics/i)).toBeInTheDocument();

    resolveOverview(jsonResponse({ overview: { totalLinks: 0, totalClicks: 0, activeLinks: 0, recentClicks: 0 } }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Some analytics charts could not be loaded.");
    expect(screen.getByText("No click activity yet.")).toBeInTheDocument();
    expect(screen.getByText("No referrer data yet.")).toBeInTheDocument();
    expect(screen.getByText("No device data yet.")).toBeInTheDocument();
    expect(screen.getByText("No links match the current filters.")).toBeInTheDocument();
  });

  it("searches, filters, paginates, and copies admin links", async () => {
    window.history.pushState({}, "", "/admin/links");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/admin/session") {
        return jsonResponse({ admin: { id: "admin-1", email: "admin@example.com" } });
      }
      if (url === "/api/admin/analytics/overview") {
        return jsonResponse({ overview: { totalLinks: 21, totalClicks: 809, activeLinks: 18, recentClicks: 44 } });
      }
      if (url === "/api/admin/analytics/clicks-by-day") {
        return jsonResponse({ days: [] });
      }
      if (url === "/api/admin/analytics/referrers") {
        return jsonResponse({ referrers: [] });
      }
      if (url === "/api/admin/analytics/devices") {
        return jsonResponse({ devices: [] });
      }
      if (url === "/api/admin/links?page=1&pageSize=10&status=all") {
        return jsonResponse({ links: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 } });
      }
      if (url === "/api/admin/links?page=1&pageSize=10&status=all&q=docs") {
        return jsonResponse({
          links: [adminLink({ id: "docs-1", originalUrl: "https://example.com/docs/start", shortCode: "docs" })],
          pagination: { page: 1, pageSize: 10, totalItems: 12, totalPages: 2 },
        });
      }
      if (url === "/api/admin/links?page=2&pageSize=10&status=all&q=docs") {
        return jsonResponse({
          links: [adminLink({ id: "docs-2", originalUrl: "https://example.com/docs/api", shortCode: "api-docs" })],
          pagination: { page: 2, pageSize: 10, totalItems: 12, totalPages: 2 },
        });
      }
      if (url === "/api/admin/links?page=1&pageSize=10&status=active&q=docs") {
        return jsonResponse({
          links: [adminLink({ id: "active-docs", originalUrl: "https://example.com/docs/live", shortCode: "live-docs" })],
          pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
        });
      }
      return new Response(null, { status: 404 });
    });

    render(<App />);

    expect(await screen.findByRole("heading", { name: /all links/i })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/search links/i), " docs ");
    await userEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/links?page=1&pageSize=10&status=all&q=docs"));
    expect(await screen.findByRole("cell", { name: "docs" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /copy docs/i }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/docs`);
    expect(screen.getByText(/page 1 of 2/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/links?page=2&pageSize=10&status=all&q=docs"));
    expect(await screen.findByRole("cell", { name: "api-docs" })).toBeInTheDocument();
    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/status/i), "active");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/admin/links?page=1&pageSize=10&status=active&q=docs"));
    expect(await screen.findByRole("cell", { name: "live-docs" })).toBeInTheDocument();
    expect(screen.getByLabelText(/status/i)).toHaveValue("active");
  });

  it("can rerender from the public form to the admin shell without changing hook order", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "UNAUTHENTICATED", message: "Admin session is required." }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    const { rerender } = render(<App />);
    expect(screen.getByRole("heading", { name: /share cleaner links in seconds/i })).toBeInTheDocument();

    window.history.pushState({}, "", "/admin");
    rerender(<App />);

    expect(await screen.findByRole("heading", { name: /admin sign in/i })).toBeInTheDocument();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function adminLink(overrides: Partial<AdminLinkFixture> = {}) {
  return {
    id: "link-1",
    originalUrl: "https://example.com/campaign",
    shortCode: "campaign",
    isActive: true,
    expiresAt: null,
    totalClickCount: 88,
    createdAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:00:00.000Z",
    ...overrides,
  };
}

type AdminLinkFixture = {
  id: string;
  originalUrl: string;
  shortCode: string;
  isActive: boolean;
  expiresAt: string | null;
  totalClickCount: number;
  createdAt: string;
  updatedAt: string;
};
