# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `libdocs resolve <library name>` prints the matching libraries
  and their Context7-compatible IDs; `libdocs docs <libraryId>` prints
  documentation text, with `--tokens` and `--topic` controls.
- MCP server (`libdocs mcp`, stdio) with two tools:
  `resolve-library-id` and `get-library-docs`.
- Talks to the public Context7 API: the search endpoint for
  resolution and the per-library endpoint in plain-text mode for
  documentation. Token budgets below the service minimum of 10000 are
  raised to 10000.
- `CONTEXT7_API_KEY` is optional: sent as a Bearer token when set,
  requests proceed without one when it is absent.
- All HTTP goes through an injectable fetch function, so the test
  suite runs entirely on hand-written fixtures with no network access.
