import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  apiKeyFromEnv,
  formatMatches,
  getLibraryDocs,
  resolveLibrary,
} from "../src/docs.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

// Hand-written fixture in the shape of the Context7 search endpoint's
// JSON response: a results list whose entries carry an id, a title, a
// description, and token / snippet / trust figures.
const SEARCH_JSON = JSON.stringify({
  results: [
    {
      id: "/vercel/next.js",
      title: "Next.js",
      description: "The React framework for production-grade applications.",
      totalTokens: 81234,
      totalSnippets: 4210,
      trustScore: 9.8,
      versions: ["v14.3.0", "v15.0.0"],
    },
    {
      id: "/websites/nextjs",
      title: "Next.js Documentation Website",
      description: "Official Next.js documentation site mirror.",
      totalTokens: 40211,
      totalSnippets: 1980,
      trustScore: 8.1,
    },
  ],
});

const DOCS_TEXT = "# Next.js Documentation\n\nNext.js is a React framework.\n";

interface Captured {
  url?: string;
  headers?: Record<string, string>;
}

function jsonResponse(body: string): HttpResponse {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "application/json" },
    text: async () => body,
  };
}

/** Fake fetch: records the request, serves fixture bodies by path. */
function fakeFetch(captured: Captured): FetchFn {
  return async (url: string, init?: { headers?: Record<string, string> }) => {
    captured.url = url;
    captured.headers = init?.headers;
    if (url.startsWith("https://context7.com/api/v1/search")) {
      return jsonResponse(SEARCH_JSON);
    }
    if (url.includes("/no/such-lib")) {
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: { get: () => null },
        text: async () => "no such library",
      };
    }
    if (url.startsWith("https://context7.com/api/v1/")) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "text/plain; charset=utf-8" },
        text: async () => DOCS_TEXT,
      };
    }
    return {
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: { get: () => null },
      text: async () => "no such library",
    };
  };
}

describe("apiKeyFromEnv", () => {
  it("returns the trimmed key when set, undefined when absent or blank", () => {
    assert.equal(apiKeyFromEnv({ CONTEXT7_API_KEY: " ctx7-key " }), "ctx7-key");
    assert.equal(apiKeyFromEnv({}), undefined);
    assert.equal(apiKeyFromEnv({ CONTEXT7_API_KEY: "   " }), undefined);
  });
});

describe("resolveLibrary", () => {
  it("queries the search endpoint and parses the matches", async () => {
    const captured: Captured = {};
    const out = await resolveLibrary(fakeFetch(captured), { libraryName: "next.js" });
    assert.equal(out.libraryName, "next.js");
    assert.equal(out.matches.length, 2);
    assert.deepEqual(out.matches[0], {
      id: "/vercel/next.js",
      title: "Next.js",
      description: "The React framework for production-grade applications.",
      totalTokens: 81234,
      totalSnippets: 4210,
      trustScore: 9.8,
      versions: ["v14.3.0", "v15.0.0"],
    });
    assert.ok(captured.url?.startsWith("https://context7.com/api/v1/search?"));
    assert.ok(captured.url?.includes("query=next.js"));
    assert.ok(out.text.includes("Context7-compatible library ID: /vercel/next.js"));
    assert.ok(out.text.includes("Trust Score: 9.8"));
  });

  it("proceeds without an Authorization header when no key is given", async () => {
    const captured: Captured = {};
    await resolveLibrary(fakeFetch(captured), { libraryName: "react" });
    assert.equal(captured.headers?.Authorization, undefined);
  });

  it("sends the key as a Bearer token when one is given", async () => {
    const captured: Captured = {};
    await resolveLibrary(fakeFetch(captured), { libraryName: "react" }, "ctx7-key");
    assert.equal(captured.headers?.Authorization, "Bearer ctx7-key");
  });

  it("URL-encodes the library name in the query", async () => {
    const captured: Captured = {};
    await resolveLibrary(fakeFetch(captured), { libraryName: "tanstack query" });
    assert.ok(captured.url?.includes("query=tanstack%20query"));
  });

  it("accepts a bare array response and formats an empty result set", async () => {
    const bareArray: FetchFn = async () => jsonResponse("[]");
    const out = await resolveLibrary(bareArray, { libraryName: "nope-lib" });
    assert.deepEqual(out.matches, []);
    assert.equal(out.text, 'No libraries found matching "nope-lib".');
  });

  it("rejects an empty name and propagates HTTP failures", async () => {
    await assert.rejects(
      () => resolveLibrary(fakeFetch({}), { libraryName: "  " }),
      /non-empty/,
    );
    const failing: FetchFn = async () => ({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: { get: () => null },
      text: async () => "slow down",
    });
    await assert.rejects(
      () => resolveLibrary(failing, { libraryName: "react" }),
      /HTTP 429/,
    );
  });

  it("errors clearly when the search response is not JSON", async () => {
    const notJson: FetchFn = async () => jsonResponse("<html>oops</html>");
    await assert.rejects(
      () => resolveLibrary(notJson, { libraryName: "react" }),
      /not valid JSON/,
    );
  });
});

describe("formatMatches", () => {
  it("omits figures the service did not report", () => {
    const text = formatMatches("x", [{ id: "/a/b", title: "B", description: "" }]);
    assert.equal(text, "- Title: B\n  Context7-compatible library ID: /a/b");
  });
});

describe("getLibraryDocs", () => {
  it("fetches the docs path in text mode with the default token budget", async () => {
    const captured: Captured = {};
    const out = await getLibraryDocs(fakeFetch(captured), {
      context7CompatibleLibraryID: "/vercel/next.js",
    });
    assert.equal(out.libraryId, "/vercel/next.js");
    assert.equal(out.tokens, 10000);
    assert.equal(out.text, DOCS_TEXT);
    assert.ok(
      captured.url?.startsWith("https://context7.com/api/v1/vercel/next.js?"),
    );
    assert.ok(captured.url?.includes("type=txt"));
    assert.ok(captured.url?.includes("tokens=10000"));
  });

  it("adds a missing leading slash and passes the topic through", async () => {
    const captured: Captured = {};
    const out = await getLibraryDocs(fakeFetch(captured), {
      context7CompatibleLibraryID: "vercel/next.js",
      topic: "routing",
    });
    assert.equal(out.libraryId, "/vercel/next.js");
    assert.equal(out.topic, "routing");
    assert.ok(captured.url?.includes("topic=routing"));
  });

  it("raises a token budget below the service minimum", async () => {
    const captured: Captured = {};
    const out = await getLibraryDocs(fakeFetch(captured), {
      context7CompatibleLibraryID: "/vercel/next.js",
      tokens: 5000,
    });
    assert.equal(out.tokens, 10000);
    assert.ok(captured.url?.includes("tokens=10000"));
    const bigger = await getLibraryDocs(fakeFetch(captured), {
      context7CompatibleLibraryID: "/vercel/next.js",
      tokens: 20000,
    });
    assert.equal(bigger.tokens, 20000);
  });

  it("rejects an empty ID and propagates HTTP failures", async () => {
    await assert.rejects(
      () => getLibraryDocs(fakeFetch({}), { context7CompatibleLibraryID: "" }),
      /non-empty/,
    );
    await assert.rejects(
      () =>
        getLibraryDocs(fakeFetch({}), {
          context7CompatibleLibraryID: "/no/such-lib",
        }),
      /HTTP 404/,
    );
  });
});
