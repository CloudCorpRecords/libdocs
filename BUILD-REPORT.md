# libdocs — Build Report

MCP Rebuild 100, Tier B. Clean-room rebuild of the Context7 MCP server
(@upstash/context7-mcp), built from the public tool spec captured in
`harness/fixtures/context7-tools-original.json`. The fixture's
`"_source"` records the split provenance honestly: the tool count (2)
is audited ground truth — the mcpaudit index
(`~/workspace/packages-100/mcp-server-index-external.md`) records
"@upstash/context7-mcp | 2 tools, advertises prompts/resources
(serves empty) | counts matched" — while the tool names, parameter
types, and required sets are docs-derived from the original project's
public documentation, because the audited index does not publish full
inputSchemas. Local build only — nothing pushed or published, and no
live network call was made or claimed at any point.

Identity: repo `libdocs`, npm `@reneturcios/libdocs`,
MCP name `io.github.CloudCorpRecords/libdocs`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `libdocs: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Resolve library names and fetch
  current, version-specific documentation via Context7." = **85 chars**
  (≤100 ✓); npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/libdocs:0.1.0` carries **no** `version`
  field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/libdocs"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`resolve`, `docs`, `mcp`,
  `--version`; exit 2 usage / 1 lookup error), `src/mcp.ts`,
  `src/types.ts`, `src/docs.ts` (core logic, `VERSION = "0.1.0"`)
- `test/docs.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to libdocs)

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the fleet precedent: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the public spec and
  break exact schema parity. Zod still validates every `tools/call`.
- Resolution queries the real search endpoint
  `https://context7.com/api/v1/search?query=...` and normalises both
  response shapes the service is documented to return (a `{results}`
  object or a bare array) into matches with ID / title / description /
  token / snippet / trust figures, rendered as plain text.
  Documentation is fetched from `https://context7.com/api/v1/<libraryId>`
  in plain-text mode (`type=txt`), with the token budget and topic
  passed as query parameters when present; a missing leading slash on
  the ID is added, and token budgets below the service minimum of
  10000 are raised to 10000, matching documented upstream behaviour.
- `CONTEXT7_API_KEY` is **optional** for this service, per the spec:
  when set it is sent as `Authorization: Bearer <key>`, when absent
  the requests proceed without an Authorization header. This build
  never errors on a missing key — that behaviour is unit-tested both
  ways.
- All HTTP flows through an injectable `FetchFn` (types.ts). The test
  suite uses a fake fetch returning hand-written fixtures in the
  documented response shapes — **no live call was performed during
  this build**, so behaviour against the live API's current responses
  is unverified (see Gaps).

## Verification (exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo exit=$?
tsc exit=0
```
`dist/` produced, including `dist/cli.js` with the
`#!/usr/bin/env node` shebang.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 13
ℹ pass 13
ℹ fail 0
```
Covers: env-key reading (set / absent / blank), search-endpoint URL
and query encoding, result parsing (all reported figures), Bearer
header sent with a key and absent without one, bare-array and empty
result handling, non-JSON and HTTP-429 error paths, docs URL building
(leading slash added, `type=txt`, default budget), the sub-minimum
token raise (5000 → 10000, 20000 untouched), topic pass-through, and
empty-ID / HTTP-404 errors.

### 3. CLI / MCP smoke
`--version` → `0.1.0`; unknown command exits 2 with Usage. MCP
`initialize` over stdio → `serverInfo: {"name":"libdocs","version":"0.1.0"}`.
CLI resolve/docs against the live API were **not** run (offline build
rule for this wave).

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/context7-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/libdocs/dist/cli.js mcp" \
    --out .../builds/libdocs/parity-out
verdict=PASS parity_pct=100.0 original_tools=2 rebuild_tools=2 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
Original side is tools-file mode, so `fixture_results` records
`SKIPPED-TOOLS-FILE-MODE` — expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was copied from privatesearch's and edited with
the file edit tool: top-level `name`, root package `name`, and root
package `bin` key changed privatesearch -> libdocs (dependency ranges
are identical, so the tree is unchanged). **Clean regeneration
(no `node_modules` present) is required before publish**; do not
publish from this lockfile as-is. `node_modules` here is a `cp -a`
copy of privatesearch's (ownership-preservation warnings during the
copy were cosmetic; `.bin/tsc` / `.bin/tsx` verified working).

## Gaps / honest notes

- No live Context7 call was made. The request/response handling is
  written against the documented API shapes as captured in the
  hand-written test fixtures; if the live search response has drifted
  (field renames, a different envelope), resolution parsing may return
  fewer matches until adjusted. A live smoke belongs to the publish
  wave (and can run keyless, since the key is optional).
- The fixture's schemas are docs-derived, not hand-probed: the
  audited index confirms the tool count (2) only. If a future
  hand-probe of the original server shows additional schema detail
  (e.g. `tokens` typed as integer), the fixture and this build's
  literals should be updated together.
- Version-specific IDs (e.g. `/vercel/next.js/v15.0.0`) are passed
  through in the docs path as documented; not exercised live.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.

## Publish-gate remediation (2026-10-27)

Recorded under Rene's 2026-10-27 decision ("Remediate the 6: add param
descriptions + capability-class vet policy, then re-gate") and
`publish/GATE-POLICY.md`, following the standing Wave 2 remediation
pattern. This is an authorized deviation from the parity-faithful
state: descriptions were added to every tool parameter that lacked
one, in the `src/mcp.ts` schema literals only — parameter names,
types and required lists are unchanged.

- Descriptions added: 4 insertion points, covering 4 served parameter
  occurrences (no shared schema consts in this unit; each insertion
  serves exactly one occurrence). Insertion points:
  `resolve-library-id` parameter `libraryName`; and
  `get-library-docs` parameters `context7CompatibleLibraryID`,
  `tokens`, `topic`. These cover the 2 PARAMS_UNDESCRIBED deductions
  in `publish/regate/libdocs-mcpaudit.json` (1 parameter on
  `resolve-library-id`, 3 parameters on `get-library-docs`).
  The vet REVIEW 25 CAP-ENV-NET item was already adjudicated
  ACCEPTED-WITH-RATIONALE by the coordinator (Context7 API key via
  apiKeyFromEnv, in-class for network-API); no action was taken on
  vet in this remediation.
- Rebuild: `npm run build` exit 0; `tsc --noEmit` exit 0; full
  test suite 13/13 pass (tests 13, pass 13, fail 0).
- Parity harness re-run, verbatim: **PARTIAL, parity_pct 50.0** —
  original_tools=2 rebuild_tools=2 missing=[] extra=[]
  schema_diffs=['get-library-docs', 'resolve-library-id']. Every one of
  the 4 schema diffs is a description addition
  (`*.description: present in rebuild but not in original`); 0
  structural diffs. Structural parity proven independently:
  stripping `description` keys from BOTH the pre- and
  post-remediation tools/list deep-equals (strip-proof RESULT: PASS;
  every description present in PRE is byte-identical in POST, and
  the only additions are at inputSchema property paths — 4
  additions, 0 removals). Adjudication: the description-only diff
  is the authorized remediation itself; structural parity is
  unchanged. Full record:
  `publish/parity-remediation/libdocs/parity.json` and
  `publish/parity-remediation/libdocs/strip-proof.txt`.
- No publish gate was run in this remediation (no mcpaudit/mcpvet),
  and nothing was published.
