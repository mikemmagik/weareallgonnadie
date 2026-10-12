# AI-001: OpenClaw content automation

Three HTTP API workflows for the existing MacBook/OpenClaw installation. Node 24,
native TypeScript/ESM and built-in libraries. **No additional dependencies, model
service, database, broker, Docker or server.** No live agents, bots, credentials,
schedules or deployment were changed.

INT-001 connects these workflows to the implemented local Worker/D1 API. Root
validation includes automation typechecking/tests and real HTTP integration. A 501
remains a terminal error for compatibility; integrated routes no longer return it.

## Workflows

- **Telegram:** one public HTTP(S) URL per private message from an allowlisted
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

| Variable                     | Required for            | Meaning                                                      |
| ---------------------------- | ----------------------- | ------------------------------------------------------------ |
| `WAAGD_API_ORIGIN`           | All commands            | HTTPS site origin; loopback HTTP allowed locally             |
| `WAAGD_API_WRITE_TOKEN`      | All commands            | API bearer secret; never sent on public GET                  |
| `WAAGD_STATE_DIR`            | All commands            | Absolute private state directory outside repo                |
| `WAAGD_TELEGRAM_BOT_TOKEN`   | Telegram                | Separate bot secret, supplied later by owner                 |
| `WAAGD_TELEGRAM_ALLOWED_IDS` | Telegram                | Comma-separated numeric user IDs; empty denies all           |
| `WAAGD_OPENCLAW_AGENT`       | Daily/monthly           | Dedicated agent; default `waagd`                             |
| `WAAGD_OPENCLAW_BIN`         | Daily/monthly           | Existing executable, preferably absolute; default `openclaw` |
| `WAAGD_TIMEZONE`             | Monthly                 | IANA timezone, default `Asia/Bangkok`; match schedule        |
| `WAAGD_SOURCES_FILE`         | Optional daily override | JSON file, defaults to supplied source example               |

With the local or deployed API and a privately supplied environment:

```sh
node --env-file=/absolute/private/waagd.env automation/cli.ts telegram
node --env-file=/absolute/private/waagd.env automation/cli.ts daily
node --env-file=/absolute/private/waagd.env automation/cli.ts monthly
node --env-file=/absolute/private/waagd.env automation/cli.ts monthly 2026-09
node --env-file=/absolute/private/waagd.env automation/cli.ts retry
```

Telegram runs until signalled or five consecutive polling cycles fail. Other commands
are one-shot. JSON stdout reports daily results, including partial failures; a run
that cannot proceed exits nonzero. Errors exclude upstream text, credentials and bodies.

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
buffered; preview image URLs are metadata only. No raw embed HTML, media reuploads,
protected scraping, credentials, paywall workarounds or authentication bypasses.

Unavailable or missing metadata gets a neutral hostname title and optional link card. Known public
YouTube/Reddit/TikTok/Instagram URL forms get provider hints; rendering is not promised.
Short URLs/unsupported forms keep links. Unsafe targets fail technically; ordinary HTTP/transport metadata failures still allow
the original public link to publish without inventing a headline.

Private state uses atomic `0600` JSON files and workflow/payload locks:

- `outgoing-*.json`: exact payload saved before submission, no credentials. Retry
  transport errors/429/500/503, at most three HTTP attempts with backoff/jitter per
  cycle, at most ten submission cycles per saved payload. Honor Retry-After and persist
  long delays. `retry` processes at most 50 due payloads. Exhausted payloads remain
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

Deletes have bounded in-process retries and are not queued. Replay does not send
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
