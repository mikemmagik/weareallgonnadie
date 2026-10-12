# INT-001 integration handoff

Integrated application is on `integration/mvp`. The backend, frontend and automation
branches merged without conflicts, retaining their implementations. `main` remains
at foundation commit `ee1f035`. No production deployment or live bot/OpenClaw change
was performed. The owner confirmed OpenClaw is not installed on this Mac and instructed
integration to continue with mocks.

## Merged commits

| Branch            | Supplied implementation | Integration merge |
| ----------------- | ----------------------- | ----------------- |
| `feat/backend`    | `d510a62`               | `769a0d7`         |
| `feat/frontend`   | `02e1b62`               | `359ee2b`         |
| `feat/automation` | `bab20f1`               | `b46fb34`         |

The final INT-001 fix/documentation commit follows these merges. Retrieve its exact
SHA with `git log -1 integration/mvp`; this avoids embedding a self-referential hash.

## Review findings and implemented fixes

- Wire envelopes, authentication, duplicate outcomes, deletion, migration indexes and
  cursor tuples agree across the actual implementations; no dependency versions conflict.
- Telegram emitted `/?post=<id>` but the frontend only fetched the list. It now fetches
  the item API, inserts/sorts the target once without changing its cursor, focuses the
  card, and reports missing/deleted IDs or retryable lookup failures on the same page.
- Query-sensitive duplicates included tracking parameters. The shared normalizer now
  removes case-insensitive `utm_*`, `fbclid`, `gclid`, `dclid`, `msclkid`, `mc_cid`,
  `mc_eid`; content keys and original encoding/order remain. Backend and automation use
  the same function. Original URLs and metadata fetch targets retain their parameters.
- Monthly source input silently stopped at 100 and used UTC-month membership despite
  selecting the period in the schedule timezone. All visible month publications now
  reach generation using that configured calendar timezone. A regression uses 156
  eligible publications across two API pages and boundary fixtures. The existing limit
  of 100 _cited references_ stays intact; no new schema fields or reference expansion.
- Monthly references previously opened JSON endpoints. New references use readable
  publication permalinks. Existing pending drafts with old reference formats fail
  explicitly and regenerate on the next monthly run.
- Missing/blocked metadata prevented manual publishing. HTTP/transport metadata failures
  now use a neutral hostname title and preserve the original link and human approval.
  Private targets remain failures before fetching; unsafe DNS/redirect failures propagate
  through retries and cannot enter the metadata fallback. No model/classification call.
- Existing SSRF controls check all DNS addresses, pin the chosen public address, recheck
  redirects, reject private/local/mapped/metadata-service targets, limit bodies and never
  execute source HTML. Literal/private hostname guards and non-retryable unsafe errors
  now protect the manual path too. Worker itself never fetches third-party URLs.
- Root validation omitted frontend and automation unit tests and automation TypeScript.
  It now includes those plus real Worker/D1 integration. Browser scripts also propagate
  assertion failures instead of relying on the CLI's process status.
- Setup/API/architecture docs still described foundation placeholders. They now describe
  the integrated app, local D1, secrets, Telegram/OpenClaw setup and deployment gates.

The URL normalization semantic change was explicitly within the owner's INT-001
request. Shared contracts, API docs, backend/automation consumers and tests changed
together. Wire shapes, status codes, cursor version and tombstone semantics stay v1.

## Actual validation results — 12 October 2026, Asia/Bangkok

| Executed check                               | Result                                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                     | Success; 395 packages installed, audit found zero vulnerabilities                                              |
| `npm run validate`                           | Passed: all typechecks, ESLint, Prettier, 66 unit tests, build smoke test, 10 local integration test entries   |
| `npm run build`                              | Passed: Astro static assets and Wrangler dry-run Worker bundle; no deployment                                  |
| `npm run db:init`                            | Applied `0001_posts.sql` to repository-local D1 with `--local`                                                 |
| Isolated migrations inside backend suite     | Applied migration and verified a second application is a no-op                                                 |
| `npm run test:browser`                       | 34 Chromium assertions passed with representative/mock provider fixtures                                       |
| `WAAGD_BROWSER_TESTS=1 npm run test:backend` | 11 test entries passed, including 23 browser assertions against real temporary Worker/D1 and production assets |
| Current preview on 8797                      | Homepage 200; empty migrated feed 200; private temporary token authenticates; unauthorized POST 401            |

Complete local logs are retained under ignored `output/integration/`; browser screenshots
under ignored `output/playwright/`. Chromium was available in Playwright's cache;
Chrome itself was unavailable, so a temporary CLI config selected cached Chromium.
Real provider playback was mocked. No real Telegram bot or paid AI API was needed.

## Required scenario evidence

| Requested scenario                         | Executed coverage                                                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Empty feed                              | Real HTTP/D1 CRUD suite and real browser empty state                                                                                         |
| 2–4. News create/read/frontend             | Real HTTP CRUD and 29-publication production browser fixture                                                                                 |
| 5–6. Duplicate / one row                   | Real D1 uniqueness, tracking variants and 12-request concurrent duplicates                                                                   |
| 7–9. Video / click / fallback              | Actual API video round-trip; browser no-player-before-click, allowlisted frame and original fallback                                         |
| 10. Meme                                   | Actual API round-trip and production browser rendering; broken preview fallback                                                              |
| 11–12. URL-less changelog / rendering      | Real POST/idempotency and browser inert body/reference rendering                                                                             |
| 13. Pagination                             | Real D1 ties, insertions, deleted cursor rows and browser all 29 IDs exactly once                                                            |
| 14. Permalink                              | Real item API lookup of a publication outside the initial 20, focus and same-feed render                                                     |
| 15–17. Delete / disappear / no restoration | Real DELETE/read/feed/tombstone retries and browser deleted permalink                                                                        |
| 18. Unauthorized POST/DELETE               | Worker units, real HTTP and current private-token local preview                                                                              |
| 19. Automation publication                 | Actual API client/Publisher against temporary local Worker/D1; created and duplicate                                                         |
| 20. Mock Telegram                          | Real API publication, neutral metadata fallback, duplicate, deletion and tombstone with mocked external metadata; Bot API polling unit mocks |
| 21. Zero-publication discovery             | Actual local API read plus mocked source/AI returning zero; unit failure/empty-source coverage                                               |
| 22. Monthly idempotency                    | Real API monthly publication then a fresh-state rerun with zero AI calls; saved-draft and >100-source regressions                            |
| 23. Site without automation                | Real static homepage and public API remain available with no automation process                                                              |

## Integration changed files

These are changes after the three merge commits (incoming branch files retain their
own histories):

- Setup/tooling: `.dev.vars.example`, `.gitignore`, `AGENTS.md`, `README.md`, `package.json`.
- Shared/backend: `shared/contracts.ts`, `worker/url.ts`, `worker/README.md`.
- Frontend: `src/lib/feed.ts`, `src/scripts/monitor.ts`, `src/pages/index.astro`,
  `src/styles/global.css`, `src/README.md`.
- Automation: `automation/core/http.ts`, `automation/core/metadata.ts`,
  `automation/changelog/run.ts`, `automation/cli.ts`, `automation/README.md`,
  `automation/openclaw/INSTALL.md`, `automation/openclaw/changelog.md`.
- Tests: `automation/tests/automation.test.ts`, `tests/backend.integration.test.ts`,
  `tests/contracts.test.ts`, `tests/frontend.test.ts`, `tests/frontend.browser.mjs`,
  `tests/mvp.browser.mjs`, `tests/worker.test.ts`.
- Project docs: `docs/api.md`, `docs/architecture.md`, `docs/decisions.md`,
  `docs/deployment.md`, `docs/handoff.md`.

## Local application and remaining limitations

The integrated preview is running at **http://127.0.0.1:8797** using repository-local
D1. An unrelated existing foundation server owns 8787/9229 and returns 501; it was
left untouched. Start the alternative with:

```sh
npx wrangler dev --local --ip 127.0.0.1 --port 8797 --inspector-port 0
```

An ignored `.dev.vars` contains a randomly generated temporary local token (0600).
Its value was never printed or included in browser assets. Replace it privately for
continued local use. The preview DB is empty; isolated test fixtures are cleaned up.
See [README](../README.md) for install/build/migrate/start instructions and browser
setup. Testing does not claim that the existing OpenClaw installation or a real bot
was exercised: neither is present on this Mac.

Remaining limitations: public pagination is not a snapshot, so deletion racing final
changelog POST cannot be checked atomically through the current API. Model factual
accuracy requires independent QA. Provider playback depends on valid content and
provider policy. Metadata/feed parsers are lightweight and do not render JavaScript.
Timezone midnight boundaries that cannot be resolved fail explicitly. Feed retrieval
has a 1,000-page cap and fails instead of returning partial results. Old local data
with tracking-sensitive canonical keys requires reviewed reconciliation or a fresh
QA DB; do not silently mutate permanent duplicate keys/tombstones. Poller failure
recovery and stale private-state locks remain documented manual operations.

## Deployment prerequisites and manual OpenClaw setup

Production requires a separately authorized Cloudflare account/domain, real migrated
D1 binding, private Worker write secret, build/deploy action, reviewed security headers
and production smoke tests. No production resource, DNS change or merge into main was
made. See [deployment guide](deployment.md).

On the owner's existing OpenClaw host, manually:

1. Verify installed agent CLI flags, plugin SDK/service activation, Node 24 and native
   command scheduling against [INSTALL.md](../automation/openclaw/INSTALL.md).
   Current official docs support the adapter design; actual installed-version
   compatibility remains unverified.
2. Create a dedicated tools-disabled editorial agent using the existing model and
   subscription; verify JSON-only output, translations and citations without new AI keys.
3. Register a dedicated bot and supply its token/numeric allowed IDs privately; ensure
   no webhook or competing poller. Manual publication stays immediate and bypasses AI.
4. Provide the API origin/write token, absolute private state directory and matching
   timezone through the Gateway service owner's environment outside Git/agent workspace.
5. Link/enable the provided plugin in a reviewed reload window, preserving existing
   plugins, agents and bots. The plugin supervises the child poller under OpenClaw;
   a separate service manager is unnecessary. Standalone CLI is only a diagnostic option.
6. Review/enable daily and monthly native command schedules, private retries, laptop
   uptime and run history, then perform authorized real bot/model checks.

**Independent QA readiness:** ready for local backend/frontend/automation API QA,
including authentication, duplicates, security guards, rendering and pagination.
Live OpenClaw/Telegram/model behavior and production readiness remain gated on the
manual host checks above. No unresolved local integration test/build failure remains.
