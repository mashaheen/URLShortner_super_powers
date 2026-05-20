// @vitest-environment jsdom
import "./test-setup";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => {
  cleanup();
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
});
