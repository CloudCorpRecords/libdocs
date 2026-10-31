/**
 * libdocs core: library resolution and documentation fetching through
 * the public Context7 API.
 *
 * Resolution queries the search endpoint
 * (https://context7.com/api/v1/search?query=...) and normalises its
 * result list into matches with an ID, title, description, and the
 * token / snippet / trust figures the service reports. Documentation
 * is fetched from https://context7.com/api/v1/<libraryId> in plain
 * text mode (type=txt), with the token budget and topic focus passed
 * as query parameters when present.
 *
 * An API key is optional for this service: when CONTEXT7_API_KEY is
 * set it is sent as a Bearer token, and when it is absent the requests
 * simply go out without an Authorization header. A missing key is
 * never an error here.
 *
 * All HTTP goes through an injected FetchFn so the request building
 * and response handling are fully testable offline with fixtures.
 */
import type {
  DocsOptions,
  DocsResult,
  FetchFn,
  LibraryMatch,
  ResolveOptions,
  ResolveResult,
} from "./types.js";

export const VERSION = "0.1.0";

export const API_BASE = "https://context7.com/api/v1";

export const DEFAULT_TOKENS = 10000;

/** The service raises any smaller token budget to this minimum. */
export const MINIMUM_TOKENS = 10000;

/**
 * Read the optional API key from an environment map. Returns undefined
 * when the variable is unset or blank; callers proceed without it.
 */
export function apiKeyFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const raw = env.CONTEXT7_API_KEY;
  const key = typeof raw === "string" ? raw.trim() : "";
  return key ? key : undefined;
}

function authHeaders(apiKey?: string): Record<string, string> {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function requestText(
  fetchFn: FetchFn,
  url: string,
  headers: Record<string, string>,
  what: string,
): Promise<string> {
  let response;
  try {
    response = await fetchFn(url, { headers, redirect: "follow" });
  } catch (err) {
    throw new Error(
      `${what} request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const body = await response.text();
  if (!response.ok) {
    const detail = body.trim().slice(0, 200);
    throw new Error(
      `${what} failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail ? `: ${detail}` : ""}`,
    );
  }
  return body;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toMatch(raw: unknown): LibraryMatch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  if (!id) return null;
  const match: LibraryMatch = {
    id,
    title: typeof r.title === "string" ? r.title : id,
    description: typeof r.description === "string" ? r.description : "",
  };
  const totalTokens = asNumber(r.totalTokens);
  if (totalTokens !== undefined) match.totalTokens = totalTokens;
  const totalSnippets = asNumber(r.totalSnippets);
  if (totalSnippets !== undefined) match.totalSnippets = totalSnippets;
  const trustScore = asNumber(r.trustScore);
  if (trustScore !== undefined) match.trustScore = trustScore;
  if (Array.isArray(r.versions)) {
    const versions = r.versions.filter((v): v is string => typeof v === "string");
    if (versions.length > 0) match.versions = versions;
  }
  return match;
}

/** Render a match list the way a person (or an agent) reads it. */
export function formatMatches(libraryName: string, matches: LibraryMatch[]): string {
  if (matches.length === 0) {
    return `No libraries found matching "${libraryName}".`;
  }
  return matches
    .map((m) => {
      const lines = [`- Title: ${m.title}`, `  Context7-compatible library ID: ${m.id}`];
      if (m.description) lines.push(`  Description: ${m.description}`);
      if (m.totalSnippets !== undefined) lines.push(`  Code Snippets: ${m.totalSnippets}`);
      if (m.totalTokens !== undefined) lines.push(`  Total Tokens: ${m.totalTokens}`);
      if (m.trustScore !== undefined) lines.push(`  Trust Score: ${m.trustScore}`);
      if (m.versions && m.versions.length > 0) {
        lines.push(`  Versions: ${m.versions.join(", ")}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

/** Resolve a library name to its Context7-compatible library IDs. */
export async function resolveLibrary(
  fetchFn: FetchFn,
  options: ResolveOptions,
  apiKey?: string,
): Promise<ResolveResult> {
  const name = typeof options.libraryName === "string" ? options.libraryName.trim() : "";
  if (!name) throw new Error("libraryName must be a non-empty string");
  const url = `${API_BASE}/search?query=${encodeURIComponent(name)}`;
  const body = await requestText(
    fetchFn,
    url,
    { Accept: "application/json", ...authHeaders(apiKey) },
    "Context7 library search",
  );
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error("Context7 library search returned a response that was not valid JSON");
  }
  const rawList = Array.isArray(data)
    ? data
    : (data as { results?: unknown } | null)?.results;
  const matches = (Array.isArray(rawList) ? rawList : [])
    .map(toMatch)
    .filter((m): m is LibraryMatch => m !== null);
  return { libraryName: name, matches, text: formatMatches(name, matches) };
}

/** Fetch documentation text for one Context7-compatible library ID. */
export async function getLibraryDocs(
  fetchFn: FetchFn,
  options: DocsOptions,
  apiKey?: string,
): Promise<DocsResult> {
  const rawId =
    typeof options.context7CompatibleLibraryID === "string"
      ? options.context7CompatibleLibraryID.trim()
      : "";
  if (!rawId) {
    throw new Error("context7CompatibleLibraryID must be a non-empty string");
  }
  const libraryId = rawId.startsWith("/") ? rawId : `/${rawId}`;
  const requested =
    options.tokens !== undefined && Number.isFinite(options.tokens)
      ? Math.floor(options.tokens)
      : DEFAULT_TOKENS;
  const tokens = Math.max(requested, MINIMUM_TOKENS);
  const topic =
    typeof options.topic === "string" && options.topic.trim()
      ? options.topic.trim()
      : undefined;

  const params = new URLSearchParams({ type: "txt", tokens: String(tokens) });
  if (topic) params.set("topic", topic);
  const url = `${API_BASE}${libraryId}?${params.toString()}`;
  const text = await requestText(
    fetchFn,
    url,
    { Accept: "text/plain", ...authHeaders(apiKey) },
    "Context7 documentation fetch",
  );
  const out: DocsResult = { libraryId, tokens, text };
  if (topic) out.topic = topic;
  return out;
}
