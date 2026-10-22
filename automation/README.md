# AI-001: OpenClaw content automation

Three HTTP API workflows for the existing MacBook/OpenClaw installation. Node 24,
native TypeScript/ESM and built-in libraries. **No additional dependencies, model
service, database, broker, Docker or server.** No live agents, bots, credentials,
schedules or deployment were changed.

INT-001 connects these workflows to the implemented local Worker/D1 API. Root
validation includes automation typechecking/tests and real HTTP integration. A 501
remains a terminal error for compatibility; integrated routes no longer return it.

## Workflows

- **Telegram:** one or more public HTTP(S) URLs per private message from an allowlisted
  numeric user ID. Technical validation, normalization, public metadata, provider
  detection and authenticated POST only: no editorial scoring or AI call. Replies
  are PUBLISHED, ALREADY EXISTS or FAILED, with site URL and UUID on success.
  `/delete <uuid>` calls authenticated DELETE immediately. Unauthorized users,
  groups, bots and edited updates are ignored.
- **Daily:** configurable recent RSS/Atom, HN Search and USGS metadata; eliminate
  known duplicates; one existing OpenClaw agent call; validate selection; translate
  headlines faithfully to English; publish through the API. Target 3–5, at most
  five reservations per UTC day including reruns; 0–2 is valid. Source and publication
  failures are isolated and included in the JSON result. No fabricated news articles.
- **Monthly:** previous calendar month, computed in the schedule timezone, grouped
  using immutable UTC insertion timestamps converted into the configured timezone. Public feed pagination only: no research,
  deleted posts or previous changelogs as source events. Enforce 150–250 words and
  exact known publication citations. Stable `humanity-changelog:YYYY-MM` in the
  `We Are All Gonna Die` namespace prevents duplicates. Empty months skip publication.
  Saved drafts preserve the payload for uncertain retries.

References retain the existing `{url,title}` contract: source publication IDs are
encoded in readable `/?post=<uuid>` URLs and reference titles. Telegram uses the same
permalink, resolved through the existing item API inside the homepage. All visible
source publications in the month reach generation; the 100-reference limit applies
only to cited output, not monthly input.

## Local testing without credentials

From the repository root:

```sh
npm ci
npx tsc --noEmit -p automation/tsconfig.json
node --test automation/tests/*.test.ts
npm run validate
```

Root validation includes these automation checks and local API integration.
Tests mock sources, metadata, API requests/deletes/duplicates, Telegram and the AI
boundary. A temporary fake executable tests the OpenClaw CLI adapter; no installed
OpenClaw, real Telegram bot, network source or LLM is needed.

## Environment and commands

See [.env.example](.env.example); values are placeholders. For actual operation,
create a private environment file **outside Git and the agent workspace**. Never put
secrets in command arguments, model prompts, plugin configuration or public assets.
The CLI does not implicitly load `.env`: use Node `--env-file=/private/path/file.env`
or the service owner's environment injection.

| Variable                                | Required for            | Meaning                                                      |
| --------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `WAAGD_API_ORIGIN`                      | All commands            | HTTPS site origin; loopback HTTP allowed locally             |
| `WAAGD_API_WRITE_TOKEN`                 | All commands            | API bearer secret; never sent on public GET                  |
| `WAAGD_STATE_DIR`                       | All commands            | Absolute private state directory outside repo                |
| `WAAGD_ALLOW_PRODUCTION_PUBLISH_IMPORT` | Production import only  | Must be exactly `true`; disabled by default                  |
| `WAAGD_TELEGRAM_ALLOWED_IDS`            | Existing ingress        | Comma-separated numeric owner IDs; empty denies all          |
| `WAAGD_OPENCLAW_AGENT`                  | Daily/monthly           | Dedicated agent; default `waagd`                             |
| `WAAGD_OPENCLAW_BIN`                    | Daily/monthly           | Existing executable, preferably absolute; default `openclaw` |
| `WAAGD_TIMEZONE`                        | Monthly                 | IANA timezone, default `Asia/Bangkok`; match schedule        |
| `WAAGD_SOURCES_FILE`                    | Optional daily override | JSON file, defaults to supplied source example               |

With the local or deployed API and a privately supplied environment:

```sh
node --env-file=/absolute/private/waagd.env automation/cli.ts daily
node --env-file=/absolute/private/waagd.env automation/cli.ts monthly
node --env-file=/absolute/private/waagd.env automation/cli.ts monthly 2026-09
node --env-file=/absolute/private/waagd.env automation/cli.ts retry
```

### Discovery PublicationIntent import

The unattended Discovery runner invokes exactly this single-intent interface:

```sh
node --env-file=/absolute/private/waagd.env automation/cli.ts publish-import --intent-file /absolute/private/discovery-intent.json --ingress-token-file /absolute/private/discovery-ingress.token
```

Both files must be absolute, owned by the invoking user, unlinked regular files
with mode `0600`; symlinks, non-private files, oversized inputs, batches, and
invalid JSON are rejected. The intent file is bounded to 256 KiB and the separate
ingress-token file to 4 KiB. The token must not be passed through the environment,
command line, or Discovery editorial process.

By default the importer accepts the staging origin
`https://waagd-staging.waagd.workers.dev` (and loopback for automated tests) only.
Production remains disabled until the operator has completed a separate activation
procedure and sets `WAAGD_ALLOW_PRODUCTION_PUBLISH_IMPORT=true` in the private
environment file. This flag does not deploy or otherwise alter infrastructure.

The only stdout record is one of these JSON outcomes:

| Outcome     | Exit code | Meaning                                                                              |
| ----------- | --------- | ------------------------------------------------------------------------------------ |
| `created`   | 0         | A new post was confirmed.                                                            |
| `duplicate` | 0         | The existing post/receipt was confirmed.                                             |
| `held`      | 2         | Auto publication is paused or the Worker confirmed a quota hold.                     |
| `uncertain` | 3         | A retryable response was ambiguous; the durable receipt/outgoing record is retained. |
| `failed`    | 1         | Input, authorization, validation, conflict, or terminal API failure.                 |

Do not treat `uncertain` as a success and do not change the intent to retry it.
Keep one `WAAGD_STATE_DIR` for every scheduled invocation: it is where receipts,
pending outgoing records, locks, and the `auto_paused` kill switch persist. A new
state directory starts auto-paused. An operator must explicitly run `policy auto
resume` once after staging acceptance; the importer never resumes it and `policy
auto pause` remains the emergency stop.

The existing OpenClaw ingress calls the pure Telegram adapter directly; it does not
run this CLI. The guarded `telegram` CLI command is legacy compatibility only and
must not be used for `@waagd_bot`. Other commands are one-shot. JSON stdout reports
daily results, including partial failures; a run that cannot proceed exits nonzero.
Errors exclude upstream text, credentials and bodies.

## Sources

Copy [sources.example.json](discovery/sources.example.json) outside the repo to
customize unique stable names, public URLs, formats (`feed`, `hn`, `usgs`) and enabled
flags. No source is mandatory. Limits: 20 sources, 40 items each, 150 candidates total,
48 hours recency. Missing/invalid dates or dates over one hour in the future are skipped.
WHO is optional and disabled initially; verify its endpoint before enabling.
Bluesky and social platform scrapers are not MVP dependencies.

Initial public endpoints: [Ars RSS](https://feeds.arstechnica.com/arstechnica/index),
[TechCrunch RSS](https://techcrunch.com/feed/),
[BBC World RSS](https://feeds.bbci.co.uk/news/world/rss.xml),
[WHO RSS](https://www.who.int/rss-feeds/news-english.xml).
JSON adapters follow the documented [HN Search API](https://hn.algolia.com/api) and
[USGS GeoJSON format](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php).
Availability can vary; broken sources are isolated.

## Security and recovery

Metadata fetching is unauthenticated HTTP(S). All DNS addresses must be public; one
checked address is pinned per request. Each redirect is checked, with four redirects
maximum, standard ports only, and a 2 MB document limit. Private/local/mapped/reserved
and conservatively excluded IPv6 ranges fail closed. Only text/XML/JSON bodies are
buffered; preview image URLs are metadata only. DNS waiting, redirects and sockets
share the request signal (35 seconds per retryRequest attempt, or 15 seconds for a
standalone publicHttp call). OS lookup itself may finish later, but cannot open a
socket after the deadline. HTTPS previews reject local names, private/reserved IP
literals, credentials, non-default ports and unsafe schemes at ingestion/rendering.
Browser-followed image redirects and future DNS answers remain unpinned; no image
fetch/proxy is introduced. No raw embed HTML, media reuploads,
protected scraping, credentials, paywall workarounds or authentication bypasses.

Unavailable or missing metadata gets a neutral hostname title and optional link card. Known public
YouTube/Reddit/TikTok/Instagram URL forms get provider hints; rendering is not promised.
Verified vt/vm TikTok redirects use structured canonical video metadata; unresolved short URLs/unsupported forms keep links. Unsafe targets fail technically; uncertain HTTP/transport metadata failures still allow
the original public link to publish without inventing a headline. Confirmed original
404/410 is rejected before POST and never creates an outgoing payload. An unavailable
player is not evidence that an available original was removed.

Private state uses owned `0700` directories, atomic owned `0600` regular JSON files
and workflow/payload locks. Every read/write/remove/list/lock validates its path;
existing permissive folders, incorrect ownership and user-created symlinks fail with
an actionable error. No automatic chmod occurs. macOS root `/var`, `/tmp`, `/etc`
aliases are accepted only when they resolve to the corresponding `/private` path.
Review a dedicated state folder and correct it manually, or choose a fresh private
folder. Do not use shared folders as state.

State records:

- `outgoing-*.json`: exact payload saved before submission, no credentials. Retry
  transport errors/408/429/500/502/503/504, at most three HTTP attempts with backoff/jitter per
  cycle, at most ten submission cycles per saved payload. Honor Retry-After and persist
  long delays. Last HTTP status and attempt count persist after exhaustion. `retry` processes at most 50 due payloads. Exhausted payloads remain
  for manual review. Auth/validation/501 errors are removed from automatic replay.
- `processed-*.json`: successful/duplicate identities, including tombstones, suppress
  repeat discovery. Backend atomic deduplication remains authoritative.
- `discovery-YYYY-MM-DD.json`: reserve daily budget before uncertain writes. Failures
  may reduce publication volume; the cap is not a quota.
- `changelog-YYYY-MM.json`: identical monthly retry draft. Generic replay skips these;
  run `monthly YYYY-MM` to recheck currently visible references. Deleted references
  invalidate a draft for regeneration. An empty month remains unpublished.
- `telegram-offset.json`: advances after result delivery. Crash redelivery uses
  backend duplicate/delete idempotency.
- `*.lock`: overlapping operations fail closed. Normal shutdown removes locks.
  After forced termination, confirm the process is gone before manually removing
  its stale lock; no automatic guessing.

Telegram only claims that a publication was saved for retry after confirming the
outgoing record exists. Permanent publication errors and deletion failures do not
claim saved recovery. Deletes have bounded in-process retries and are not queued. Replay does not send
later Telegram notifications. Keep state outside the repository and avoid symlinks
into repository/workspace folders. Review exhausted outgoing files before explicitly
resubmitting; no separate broker is introduced.

## OpenClaw integration and limitations

[openclaw/INSTALL.md](openclaw/INSTALL.md) contains version checks, dedicated-agent
setup, separate-bot service templates and native scheduling commands. Installed
OpenClaw is absent on the INT-001 Mac per owner clarification; verify the version
and configuration on the actual installation host before enabling.
Nothing was installed or scheduled during this task.

Limitations: lightweight RSS/Atom/HTML metadata parsing, no JavaScript rendering,
protected platform scraping or additional source pagination. Monthly generation uses
all visible source publications in the configured month, with at most 100 cited
references under the unchanged wire contract. Feed-based
history deduplication has a 1,000-page cap and fails closed on truncation. Public
cursor reads are not snapshots: deletion concurrent with final POST cannot be checked
atomically through the current API. Runtime checks validate IDs and output shapes;
factual faithfulness and translation quality still depend on the configured model.

FIX-002 recognized TikTok videos additionally carry `source: "TikTok"` and the verified
video ID as `source_item_id`, including safely resolved vt/vm links. Original URLs and
ordinary tracking normalization remain unchanged. Reddit widget rendering happens only
on a reader click inside the isolated Worker adapter; metadata/discovery never executes
provider HTML, and manual Telegram submissions remain free of editorial filtering.
