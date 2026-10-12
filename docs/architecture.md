# Integrated MVP architecture

One repository and one Cloudflare project retain the approved stack:

- **Astro static frontend:** HTML/CSS plus one small browser module. Same-origin public
  feed reads use the shared validator, opaque cursor pagination and safe DOM text.
  `/?post=<id>` resolves through `GET /api/posts/:id` inside the existing feed.
- **Worker:** four publication operations under `/api/posts`, bounded JSON validation,
  fail-closed bearer writes/deletes, canonicalization and sanitized JSON errors.
- **D1:** only the Worker accesses storage. Strict schema, immutable identity/time,
  indexed tuple ordering, atomic uniqueness and permanent soft-deletion tombstones.
- **Automation:** Node 24 HTTP-only clients and private local retry state. No frontend
  credentials, database access, CMS, extra server or paid AI service.
- **OpenClaw templates:** a plugin supervises the deterministic dedicated-bot poller;
  native command schedules invoke discovery/monthly CLI jobs using a dedicated agent
  on the owner's existing subscription. The site does not depend on that process.

```text
Reader -> Cloudflare Worker project
          |-- static assets -> Astro dist/
          |-- /api/* -> Worker -> D1

Public source feeds -> local collection -> existing OpenClaw selection -> POST API
Dedicated Telegram bot -> allowlisted human URL -> optional safe metadata -> POST API
Monthly schedule -> all visible month publications -> existing agent -> POST API
```

Worker-first routing applies to `/api`, `/api/*` and the exact `/embed/reddit` adapter; other matching assets can
be served directly. Static 404 handling remains enabled. Automation writes do not
trigger builds. Reads remain public; browser code never receives a write token.

## Integration behavior

Both Worker and automation use `normalizePublicationUrl` from shared contracts for
identity. Known trackers disappear from canonical URLs; content parameters, their
encoding/order, paths and original submitted URLs are preserved. Fetching uses the
original URL independently of duplicate identity, checks every DNS address and
redirect, and pins a checked public address. Metadata HTML is parsed as data only.
Unsafe targets and confirmed original HTTP 404/410 fail; uncertain metadata failures produce a neutral hostname title
and keep the original source link. Manual submissions call no editorial model.

Monthly membership uses the configured IANA timezone and immutable UTC insertion
timestamps. Public feed pagination includes every eligible publication and excludes
deletions/changelogs. The digest cites at most 100 selected source references without
limiting its input to 100. References use readable site permalinks. No searches run.
Stable monthly source identity and saved drafts protect retries and reruns.

Embeds use allowlisted constructed HTTPS players with sandbox/permissions controls,
load only after a click, and retain original links if unavailable. Changelog HTML and
Markdown remain inert text with a small readable block subset.

FIX-001 preserves the verified final URL inside the local HTTP boundary for provider
recognition, without changing post URL/canonical identity or the wire schema. DNS,
redirects and sockets share a per-request deadline; all answers remain checked and
one public address pinned. State operations require owned 0700 directories and owned
0600 regular files, rejecting user-created symlinks. Gateway failures retain retry
metadata and payloads. Static assets use `_headers`; Worker responses explicitly
attach the same policy. See [deployment](deployment.md) for CSP and remaining limits.

## Operational boundary

The local configuration retains a sentinel DB with `remote: false`. No production
resources, deployment, bot registration, live OpenClaw agent changes or schedules
were performed. OpenClaw is absent on the integration Mac per owner clarification;
SDK/CLI compatibility is documented and mocked, not claimed as live verification.
The plugin avoids an additional service manager; the standalone Telegram CLI is a
manual diagnostic option and must not compete with the plugin's poller.

See [local setup](../README.md), [API](api.md), [deployment](deployment.md), and
[manual OpenClaw checks](../automation/openclaw/INSTALL.md).

## FIX-002 media boundaries

TikTok identity preparation uses the checked resolved video URL and preserves the
original submission. Backend ingestion validates provider/URL/ID agreement and
normalizes the stable namespace. D1 retains its existing constraints and immutable
identity trigger. A conditional insert and duplicate lookup in one batch transaction
protect old inconsistent namespaces and tombstones; ambiguous historical records
require review rather than automatic merging. The legacy guard scans old claims,
so production data volume should be assessed during deployment preparation.

The Reddit adapter is one small Worker-generated document, not a new service or
stored HTML model. The host only constructs its same-origin URL after a click.
Both its iframe and response CSP sandbox omit `allow-same-origin`; external script
execution cannot reach the parent DOM. The main CSP adds only same-origin frames;
Reddit scripts remain forbidden in the main document. Only the adapter permits the
fixed official widget script and embed.reddit.com child frames, with inline styles
for official widget sizing. No parent messaging or automatic resize protocol exists:
a 620px scrollable media area preserves the complete official widget and source links.
No provider controls/branding are hidden or rewritten. Ordinary assets/API responses
retain the existing headers. See the FIX-002 handoff for live verification limits.
