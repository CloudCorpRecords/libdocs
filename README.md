# libdocs

libdocs answers the question every coding agent runs into: what does
the current version of this library actually do? You give it a library
name, it finds the library's Context7-compatible ID, and then it pulls
the up-to-date documentation and code examples for that library —
optionally focused on one topic and capped at a token budget you pick.
It works from the command line or as an MCP server for agents.

An API key is optional. When `CONTEXT7_API_KEY` is set, libdocs sends
it as a Bearer token; when it is not set, requests simply go out
without one. There is no sign-up step to get started.

## Install

```bash
npx @reneturcios/libdocs resolve "next.js"
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/libdocs
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
# Find the Context7-compatible IDs for a library name
libdocs resolve "next.js"
libdocs resolve react

# Fetch documentation for an exact library ID
libdocs docs /vercel/next.js
libdocs docs /vercel/next.js --topic routing --tokens 20000

libdocs --version
```

Exit codes: `0` on success, `1` when a lookup fails (the error names
the problem, including the HTTP status when the service answers with
one), `2` for usage errors.

Token budgets below the service minimum of 10000 are raised to 10000,
matching the upstream behaviour.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/libdocs mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "libdocs": {
      "command": "npx",
      "args": ["-y", "@reneturcios/libdocs", "mcp"],
      "env": {
        "CONTEXT7_API_KEY": "your-key-if-you-have-one"
      }
    }
  }
}
```

The `env` block is optional — leave it out entirely to run keyless.

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `resolve-library-id` | `libraryName` (string, required) | The matching libraries, each with its title, Context7-compatible library ID, description, and the token, snippet, and trust figures the service reports. |
| `get-library-docs` | `context7CompatibleLibraryID` (string, required), `tokens` (number, optional), `topic` (string, optional) | The library's documentation and code examples as plain text, focused on `topic` when one is given. |

Resolution talks to the service's search endpoint; documentation is
fetched per library ID in plain-text mode. Lookup failures (unknown
IDs, rate limits, unreachable hosts) are reported as tool errors.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
