import { FormEvent, useState } from "react";
import { AdminApp } from "./AdminApp";

type LinkResponse = {
  shortUrl?: unknown;
};

type ApiErrorResponse = {
  message?: unknown;
};

const GENERIC_ERROR = "Unable to create link. Please try again.";

export function App() {
  if (window.location.pathname === "/admin" || window.location.pathname.startsWith("/admin/")) {
    return <AdminApp />;
  }

  return <PublicApp />;
}

function PublicApp() {
  const [url, setUrl] = useState("");
  const [alias, setAlias] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setShortUrl(null);
    setCopyStatus(null);
    setIsSubmitting(true);

    const payload: { url: string; alias?: string; expiresAt?: string } = { url };
    const trimmedAlias = alias.trim();
    if (trimmedAlias !== "") {
      payload.alias = trimmedAlias;
    }
    if (expiresAt !== "") {
      payload.expiresAt = expiresAt;
    }

    try {
      const response = await fetch("/api/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: unknown = await parseJson(response);

      if (!response.ok) {
        setError(readApiError(data));
        return;
      }

      const createdLink = data as LinkResponse;
      if (typeof createdLink.shortUrl !== "string" || createdLink.shortUrl === "") {
        setError(GENERIC_ERROR);
        return;
      }

      setShortUrl(createdLink.shortUrl);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCopy() {
    if (shortUrl === null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopyStatus("Copied to clipboard.");
    } catch {
      setCopyStatus("Copy failed. Select the link to copy it manually.");
    }
  }

  return (
    <main className="page-shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Public URL shortener</p>
        <h1 id="page-title">Share cleaner links in seconds.</h1>
        <p className="hero-copy">
          Paste a destination, choose an optional alias, and generate a short link ready for launches, docs, and campaigns.
        </p>
      </section>

      <section className="card" aria-label="Create a short link">
        <form className="link-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Destination URL</span>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/a-long-link"
              required
            />
          </label>

          <div className="field-row">
            <label className="field">
              <span>Custom alias</span>
              <input
                type="text"
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
                placeholder="spring-launch"
                aria-describedby="alias-help"
              />
              <small id="alias-help">Optional, 3-64 URL-safe characters.</small>
            </label>

            <label className="field">
              <span>Expiration date</span>
              <input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </label>
          </div>

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating link..." : "Create short link"}
          </button>
        </form>

        {error !== null ? (
          <div className="message message-error" role="alert">
            {error}
          </div>
        ) : null}

        {shortUrl !== null ? (
          <div className="message message-success">
            <span>Your short link is ready:</span>
            <a href={shortUrl}>{shortUrl}</a>
            <button className="secondary-button" type="button" onClick={handleCopy}>
              Copy short link
            </button>
            {copyStatus !== null ? <small>{copyStatus}</small> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readApiError(data: unknown): string {
  if (typeof data === "object" && data !== null) {
    const apiError = data as ApiErrorResponse;
    if (typeof apiError.message === "string" && apiError.message !== "") {
      return apiError.message;
    }
  }

  return GENERIC_ERROR;
}
