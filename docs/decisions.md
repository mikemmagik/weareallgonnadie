# Approved foundation decisions

These choices apply to this initialization request. Changing shared public behavior
requires project-owner review under `AGENTS.md`.

| Decision                                                        | Reason                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| One Git repository and npm package                              | Shared boundaries without workspace/package overhead                    |
| Astro `output: static`, no adapter                              | Pure static frontend with minimal browser JavaScript                    |
| One Worker project with Static Assets                           | One eventual deployment artifact serves frontend and API                |
| Worker-first routing for `/api` and `/api/*` only               | Keep API responses JSON and static assets served directly               |
| Native Worker request handling, no backend framework            | Four planned routes do not need another dependency                      |
| D1 binding with all-zero local sentinel, `remote: false`        | Validate locally without creating production infrastructure             |
| Separate frontend, Worker and test type configurations          | Keep Node/Worker runtime types away from browser code                   |
| Node 24.x, npm 11+, exact dependency pins and lockfile          | Supported even-numbered runtime and reproducible installations          |
| Node built-in test runner with TypeScript stripping             | No separate test framework or transpilation runner                      |
| ESLint for TS/JS; Astro checker for templates; Prettier for all | Small, explicit quality toolchain                                       |
| Shared discriminated contracts and small runtime validator      | One source of truth with no validation dependency                       |
| Structured provider metadata or fallback link                   | No stored executable HTML; unsupported embeds degrade to links          |
| Immutable server insertion time + UUID descending ordering      | Deterministic newest-first feed and stable cursor tie-breaking          |
| Nullable metadata and an explicit references array              | No ambiguous missing response fields; no references means `[]`          |
| `200 duplicate` vs `201 created`                                | Automation can distinguish processed duplicates from failed submissions |
| Duplicate keys remain occupied after soft deletion              | Retrying old submissions must not resurrect deleted content             |
| Bearer-token writers; anonymous readers                         | Machine-only write access without visitor accounts                      |
| API-only local automation integration                           | Loose coupling and no direct D1/OpenClaw modifications                  |
| Explicit `501` scaffold responses                               | Avoid claiming unfinished publication logic works                       |

No schema migration is created before backend work. No CI provider, remote Git
repository, scheduler, production resource, or deployment is configured. Runtime
limits and security headers for future embedded rendering must be reviewed when
that rendering and production deployment are requested.

## BE-001 implementation

Backend implementation was subsequently authorized. The four reserved routes now
implement contract v1; the historical scaffold decision above describes Foundation.
D1 uses strict storage, two permanent duplicate indexes and a visible-feed index.
POST performs a targeted conflict-ignore insert and duplicate lookup in one D1 batch
transaction. DELETE atomically preserves the first deletion timestamp. Authentication
uses Web Crypto HMAC verification before parsing or persistence. No dependency,
Foundation configuration or public contract changed. BE-001 originally preserved every query parameter. INT-001 refines that rule below. See [backend implementation](../worker/README.md).

## INT-001 coordinated integration decisions

The owner's integration request authorizes necessary contract correction and requires
tracking-aware duplicate behavior. The sole shared semantic change is a common
`normalizePublicationUrl` helper: remove known tracking keys while preserving content
parameters and original query encoding/order. Wire fields, errors, cursor version,
reference limits and deletion semantics remain v1. Backend/automation consumers,
API documentation and contract, unit and real-D1 tests change together.

Permalinks use the existing homepage and item API. Monthly references use those
readable permalinks instead of raw JSON endpoints. Monthly input includes the full
reporting month in the configured timezone; at most 100 _cited_ references remain
allowed, requiring no schema expansion. An exceptional unresolved local midnight
boundary fails explicitly rather than silently changing periods.

Metadata availability is optional for manual Telegram URLs; confirmed original
404/410 removal is a technical failure (FIX-001). Neutral hostname titles
retain human approval without inventing factual headlines. Unsafe URLs remain a
non-retryable error across metadata fallback, including private redirect destinations.
Fetching preserves the original query independently of canonical identity.

The existing OpenClaw plugin remains the primary poller lifecycle, avoiding another
service manager. Its supervised Node child keeps the existing standalone CLI usable
for diagnostics. The owner confirmed OpenClaw is absent on the integration Mac;
real host/version/model/bot verification is a documented prerequisite.

## FIX-001 remediation decisions

Preserve contract v1 and tracking-based canonical identity, even when a TikTok short
link resolves to a checked canonical player URL. No cross-form deduplication promise
is added. Reject insecure state paths instead of changing user folder permissions.
Expand temporary HTTP retries to 408/429/500/502/503/504; retain the existing three
requests per cycle, ten submission cycles, 50-item replay limit and manual recovery.

Reddit inline rendering remains unresolved. Official oEmbed returns HTML plus a
widget script; the present structured iframe renderer has no reviewed widget adapter.
Keep attribution/original links and do not invent a player URL or permit untrusted
HTML/script in the host DOM. Details and official references are in the FIX-001 handoff.

External previews use a shared HTTPS URL policy at ingestion and rendering. It rejects
known local names and reserved/private literals, without fetching images or adding
a proxy. Future DNS answers and browser-followed redirects remain an explicit limit.
