/**
 * libdocs types.
 *
 * Resolving takes a plain library name and yields the libraries that
 * match it, each carrying the Context7-compatible ID used to fetch its
 * documentation. Fetching takes one of those IDs plus an optional token
 * budget and topic focus, and yields the documentation text itself.
 * HTTP access is described by a minimal response surface so tests can
 * inject a fake fetch and never touch the network.
 */

export interface ResolveOptions {
  /** The general name of the library to search for, e.g. "next.js". */
  libraryName: string;
}

export interface LibraryMatch {
  /** Context7-compatible library ID, e.g. "/vercel/next.js". */
  id: string;
  title: string;
  description: string;
  /** Total documentation tokens the service reports for this library. */
  totalTokens?: number;
  /** Number of documentation snippets the service reports. */
  totalSnippets?: number;
  /** Trust score the service assigns to this library's documentation. */
  trustScore?: number;
  /** Documented versions, when the service reports them. */
  versions?: string[];
}

export interface ResolveResult {
  libraryName: string;
  matches: LibraryMatch[];
  /** The matches rendered as plain text for display. */
  text: string;
}

export interface DocsOptions {
  /** Exact Context7-compatible library ID, e.g. "/vercel/next.js". */
  context7CompatibleLibraryID: string;
  /** Maximum number of documentation tokens to return. */
  tokens?: number;
  /** Optional topic to focus the documentation on, e.g. "routing". */
  topic?: string;
}

export interface DocsResult {
  /** The library ID as sent upstream (a leading slash is ensured). */
  libraryId: string;
  /** The effective token budget after the service minimum is applied. */
  tokens: number;
  topic?: string;
  /** The documentation text returned by the service. */
  text: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
