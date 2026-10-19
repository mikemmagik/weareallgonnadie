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
- **OpenClaw boundary:** the existing Telegram ingress may call the pure deterministic
  adapter for allowlisted owner URLs; it does not start a bot, poll Telegram, or make
  an editorial AI call. The site does not depend on that process.

```text
Reader -> Cloudflare Worker project
          |-- static assets -> Astro dist/
          |-- /api/* -> Worker -> D1

WAAGD Discovery -> verified editorial intent -> Publisher -> POST API
Existing Telegram ingress -> allowlisted owner URL -> optional safe metadata -> Publisher -> POST API
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
load near the viewport after session consent, and retain original links if unavailable. Changelog HTML and
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
The adapter never creates a polling owner. The guarded standalone Telegram CLI is
legacy compatibility only and must not run for the existing bot.

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

## LEGAL-001 frontend privacy boundary

Static `/legal` and `/privacy` pages and shared footer/contact components accompany
the persistent homepage disclaimer. Public operator/contact information is configured
at build time in `src/lib/legal.ts`; no Worker binding or API changes. External
previews require a per-item action before image creation. Same-origin assets may
load normally. Player notices name validated providers; embed cards request no
separate preview. Consent is not stored. Existing sandbox/CSP/source URL policies
remain. See [LEGAL-001 handoff](legal-001-handoff.md) for launch blockers and the
remaining post-consent browser DNS/redirect limitation.

## MEDIA-UX-001 current media boundary

This supersedes the FIX-002/LEGAL-001 loading and Reddit rendering details above.
One native modal dialog controls all external media in the tab session. The frontend
stores allow/decline in sessionStorage, gates URL assignment and uses a 320px
IntersectionObserver margin (scroll/resize fallback). No provider request is needed
before a choice. Settings exist on feed and information pages. Revocation removes
loaded frames/images, invalidates pending Reddit resolution and pauses future loads.
A restored page rechecks the preference on persisted pageshow.

Reddit full URLs now use the **official widget-generated embed.reddit.com iframe**
directly, sandboxed at Reddit's own cross-origin identity. This removes the opaque
adapter ancestor that WebKit rejects under Reddit frame-ancestors, and avoids the
Origin null module CORS failure. The frame grants scripts/same-origin/popups only;
same-origin here means Reddit, never the host. No provider script executes in the
host. Main CSP adds only the fixed HTTPS Reddit frame origin, with script/style/API
policies unchanged. All host HTML retains anti-framing headers. The legacy adapter
still has its original opaque CSP and remains covered by isolation tests.

For redd.it, consent and proximity gate a same-origin GET to the existing adapter
route with resolve=1, returning only a validated full same-ID URL as JSON. The
frontend revalidates it before constructing the remote frame. Official oEmbed stays
bounded, fixed-host and redirect-free. No publication schema, database or write API
changes. Permanent attribution/title/original links and an unavailable-content hint
remain independently accessible; iframe load is never proof of content success.

TikTok has a 9:16 player capped at 400px. Instagram distinguishes /p/ from /reel/ or
/tv/, reserves portrait media plus provider chrome, and permits provider scrolling
for unusually long content. Carousel identity cannot be inferred from /p/ alone.
See [MEDIA-UX-001 handoff](media-ux-001-handoff.md) for evidence and limitations.

## MEDIA-FIX-002 playback boundary

Session consent permits external requests, not Reddit playback. Full Reddit URLs
and revalidated short-link identities initially use the official content-free
`showmedia=false` embed near the viewport. It preserves Reddit's title, attribution
and actions. The host's keyboard-accessible **Play / view Reddit media** button
removes that option only on a trusted visitor action, then focuses the provider
frame. The provider may immediately play video/animate GIF-labelled media after
this deliberate action. Revocation removes the frame/button and invalidates pending
resolution; reallow creates a summary without restoring playback activation.

The documented oEmbed response is rich markup, not a reliable image/text/video
classification. Thus full still images and body text also require the view action;
no title/extension guessing, post scraping, new metadata service or wire-contract
change is used. Inline full rendering remains supported after activation. The
legacy opaque adapter uses `data-embed-showmedia="false"` and retains source links;
it does not automatically load full post content. Provider restrictions may still
prevent its summary from rendering. Browser test tooling alone inspects provider
media state; production host code never reads the provider DOM.
