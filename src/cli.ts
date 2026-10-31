#!/usr/bin/env node
/**
 * libdocs CLI.
 *
 *   libdocs resolve <library name>
 *   libdocs docs <libraryId> [--tokens n] [--topic text]
 *   libdocs mcp
 *
 * CONTEXT7_API_KEY is optional: when set it is sent as a Bearer token,
 * when absent the requests go out without one.
 *
 * Exit codes: 0 success, 1 lookup error, 2 usage error.
 */
import { apiKeyFromEnv, getLibraryDocs, resolveLibrary, VERSION } from "./docs.js";
import type { FetchFn } from "./types.js";

function usage(): never {
  console.error(`Usage:
  libdocs resolve <library name>
  libdocs docs <libraryId> [--tokens n] [--topic text]
  libdocs mcp
  libdocs --version`);
  process.exit(2);
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function withoutFlags(args: string[], valueFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.includes(args[i])) i++;
    else out.push(args[i]);
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const apiKey = apiKeyFromEnv();
  try {
    if (cmd === "resolve") {
      const name = rest.join(" ").trim();
      if (!name) usage();
      const result = await resolveLibrary(fetchFn, { libraryName: name }, apiKey);
      console.log(result.text);
    } else if (cmd === "docs") {
      const positional = withoutFlags(rest, ["--tokens", "--topic"]);
      const [libraryId] = positional;
      if (!libraryId) usage();
      const tokensRaw = flagValue(rest, "--tokens");
      const tokensParsed = tokensRaw !== undefined ? Number(tokensRaw) : undefined;
      const result = await getLibraryDocs(
        fetchFn,
        {
          context7CompatibleLibraryID: libraryId,
          tokens:
            tokensParsed !== undefined && Number.isFinite(tokensParsed)
              ? tokensParsed
              : undefined,
          topic: flagValue(rest, "--topic"),
        },
        apiKey,
      );
      console.log(result.text);
    } else {
      usage();
    }
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
