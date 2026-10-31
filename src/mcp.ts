/**
 * libdocs MCP server. Tools: resolve-library-id, get-library-docs.
 *
 * Why the low-level Server instead of McpServer: the high-level helper
 * converts zod schemas to JSON Schema and injects keys that are not in
 * this tool's public spec ("$schema" and "additionalProperties"), which
 * breaks exact tool-list/schema parity with the spec. This file serves
 * tools/list with the spec's exact input schemas as explicit literals,
 * while zod still validates every tools/call argument set. Tool names,
 * parameters, and required sets are taken from the public spec.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { apiKeyFromEnv, getLibraryDocs, resolveLibrary, VERSION } from "./docs.js";
import type { FetchFn } from "./types.js";

const ResolveArgs = z.object({
  libraryName: z.string(),
});

const DocsArgs = z.object({
  context7CompatibleLibraryID: z.string(),
  tokens: z.number().optional(),
  topic: z.string().optional(),
});

const TOOLS = [
  {
    name: "resolve-library-id",
    description:
      "Resolve a library name into a Context7-compatible library ID, returning the matching libraries.",
    inputSchema: {
      type: "object" as const,
      properties: {
        libraryName: {
          type: "string",
          description:
            "Name of the library to resolve into a Context7-compatible library ID.",
        },
      },
      required: ["libraryName"],
    },
  },
  {
    name: "get-library-docs",
    description:
      "Fetch current documentation and code examples for a library using its Context7-compatible library ID.",
    inputSchema: {
      type: "object" as const,
      properties: {
        context7CompatibleLibraryID: {
          type: "string",
          description:
            'Context7-compatible library ID to fetch documentation for, as returned by resolve-library-id, for example "/vercel/next.js".',
        },
        tokens: {
          type: "number",
          description:
            "Optional maximum number of documentation tokens to return; defaults to 10000 and values below 10000 are raised to 10000.",
        },
        topic: {
          type: "string",
          description:
            'Optional topic to focus the returned documentation on, for example "routing".',
        },
      },
      required: ["context7CompatibleLibraryID"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "libdocs", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const apiKey = apiKeyFromEnv();
  try {
    if (name === "resolve-library-id") {
      const parsed = ResolveArgs.parse(args ?? {});
      const result = await resolveLibrary(fetchFn, parsed, apiKey);
      return textResult(result.text);
    }
    if (name === "get-library-docs") {
      const parsed = DocsArgs.parse(args ?? {});
      const result = await getLibraryDocs(fetchFn, parsed, apiKey);
      return textResult(result.text);
    }
  } catch (err) {
    return errorResult(err);
  }
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
