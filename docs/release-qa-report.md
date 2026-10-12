# RELEASE-QA-001 — Final Independent MVP Acceptance

## 1. Baseline and scope

**LOCAL MVP READINESS: FAIL / NO-GO for unconditional staging acceptance.** The
ordinary local MVP and shipped suites pass, but independent acceptance reproduces
one P2 defect in the required conflicting-legacy TikTok identity behavior.

**PRODUCTION READINESS: FAIL / NO-GO.** Resolve that defect, complete unmocked
Reddit rendering/media verification, decide the carried external-preview risk, and
complete the separately authorized deployment and intended-host checks below.

Audited application baseline: **`218ff87f6396614d8a3a55aced64cdf2d97a5fa2`**, requested
`fix/final-media` revision. Checkout: `/Users/mikemmagik/Documents/waagd-release-qa`,
branch **`qa/release-candidate`**. Review: **13 October 2026, Asia/Bangkok**. The
checkout started clean. Only this report and two acceptance fixtures are added;
application code, existing tests, contracts, migrations, lockfile and configuration
remain at baseline. The retained `tests/regression-001.mjs` is unchanged.

Read `AGENTS.md`, the QA and REGRESSION-001 reports, both FIX handoffs, API and
deployment documentation. Inspected actual Worker routing/auth/input/storage,
Reddit adapter, shared media/preview policies, frontend presentation/render/feed,
automation transport/state/Telegram/discovery/changelog and exercised tests. Prior
reports were reference claims, not this run's results. Setup instructions in those
documents did not authorize production or live automation operations.

## 2. Environment and isolation

- macOS arm64; Node **v24.15.0**, npm **11.12.1**; locked Astro **7.3.8** and
  Wrangler **4.149.0**. Playwright CLI **0.1.22**, cached Chromium **155.0.8059.12**,
  headless isolated session **`releaseqa`**, with Chrome channel unset.
- `npm ci` installed 395 packages, audited 396, reported zero vulnerabilities.
  This records the package audit result, not comprehensive dependency assurance.
- Fresh temporary D1 databases, actual migration `0001_posts.sql`, real local
  workerd HTTP, dynamically allocated loopback ports, inspector port 0. Independent
  initial Worker used port 55865; complete provider URLs are in the evidence.
- Sentinel database IDs, `remote: false`, `remoteBindings: false`, explicit
  `--local` migrations, environment-file loading disabled. Fixtures remove inherited
  Cloudflare credential variables and use temporary test-only tokens. Install/build
  tool preferences are in ignored `.wrangler/release-*`; runtime configuration/state
  is temporary and removed by fixture cleanup.
- Separate Astro development server at **`http://127.0.0.1:55720`** for the frontend
  suite. Only the QA-owned server and browser session are stopped.
- Telegram, AI, metadata transport, DNS/socket challenges and deterministic provider
  responses use mocks. Live Reddit browser traffic is unmocked and anonymous.
  No private/internal service was contacted, and no bypass or network configuration
  change was attempted.

No production credentials, production database, deployment, DNS action, bot
registration, live OpenClaw operation, merge or new product feature was used.

## 3. Executed tests and evidence

Commands ran from the checkout above. Install/build/validation additionally set
`ASTRO_TELEMETRY_DISABLED=1`, `WRANGLER_SEND_METRICS=false`, isolated XDG paths and
removed inherited Cloudflare token/account variables. Counts overlap across commands
and must not be summed as a unique test total. Integration counts include the parent.

| Actual command                                                                                                                                      | Exit / classification | Result                                                                                                                                                        | Evidence under `output/release-qa/`                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm ci`                                                                                                                                            | 0 / PASS              | 395 installed; zero reported vulnerabilities                                                                                                                  | `npm-ci.log`                                                   |
| `npm run build`                                                                                                                                     | 0 / PASS              | Static frontend and Worker dry-run bundle; no deployment                                                                                                      | `build.log`                                                    |
| `node --test tests/regression-001.mjs`                                                                                                              | 0 / PASS              | 6 runner entries; retained one-publication assertion passes                                                                                                   | `regression.log`                                               |
| `node --test automation/tests/*.test.ts`                                                                                                            | 0 / PASS              | 56 tests                                                                                                                                                      | `automation.log`                                               |
| `npm run validate`                                                                                                                                  | 0 / PASS              | Astro 0 errors/warnings/hints; strict TypeScript, lint, formatting; 84 unit tests, 1 build smoke, 16 real D1/HTTP entries                                     | `validate.log`                                                 |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=releaseqa node --test tests/backend.integration.test.ts`                                               | 0 / PASS              | 17 entries; 36 integrated browser assertions plus 28 deterministic Reddit assertions                                                                          | `backend-browser.log`                                          |
| `npm run dev -- --host 127.0.0.1 --port 55720`                                                                                                      | 0 / PASS              | Isolated frontend server started                                                                                                                              | Recorded local URL above                                       |
| `/Users/mikemmagik/.codex/skills/playwright/scripts/playwright_cli.sh -s=releaseqa open about:blank --config output/playwright/release.config.json` | 0 / PASS              | Isolated cached Chromium; no browser installation                                                                                                             | Configuration retained locally                                 |
| `WAAGD_BROWSER_SESSION=releaseqa WAAGD_FRONTEND_BASE=http://127.0.0.1:55720 npm run test:browser`                                                   | 0 / PASS              | 34 browser assertions                                                                                                                                         | `frontend-browser.log`                                         |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=releaseqa node --test tests/regression-001.mjs`                                                        | 0 / PASS              | 7 entries; 19 provider/CSP browser assertions                                                                                                                 | `regression-browser.log`                                       |
| `WAAGD_LIVE_REDDIT=1 WAAGD_BROWSER_SESSION=releaseqa node --test tests/release-qa.mjs`                                                              | **1 / FAIL**          | 3 failing legacy acceptance children, 1 passing consistent-legacy control, 1 passing live-outcome recorder; parent also fails: 2 pass / 4 fail runner entries | `independent.log`, `legacy-identities.json`, `reddit-live.txt` |
| `npx eslint tests/release-qa.mjs tests/release-qa.browser.mjs`                                                                                      | 0 / PASS              | Added fixtures lint cleanly                                                                                                                                   | `fixture-lint.log`                                             |

The independent fixture is deliberately retained with its unmet acceptance
expectations. A passing live-outcome recorder means the observation completed;
it does **not** mean Reddit content rendered. `npm run validate` uses an explicit
test list and does not execute `tests/release-qa.mjs`; its green result cannot
override this independent failure.

Final `npm run validate` after adding the report/fixtures also exited 0 with the
same 84 unit / 1 smoke / 16 D1 runner results (`final-validate.log`). Final baseline
comparison found no edits to any previously tracked file. The QA browser closed
and the Astro process (PID 54074) stopped successfully; fixture-created Worker/D1
state was removed. Cleanup outcomes are in `browser-close.log` and `astro-stop.log`.

The live recorder was repeated after tightening pre-click observation to requests
as well as responses and aligning original-link status/text with the same repeated
navigation. This affected only evidence collection. The initial run/log is retained
as `independent-initial.log` and `reddit-live-initial.txt`; the legacy failures agree.

Evidence is local and ignored by Git: logs/JSON under `output/release-qa/`, retained
D06 evidence under `output/regression-001/`, screenshots and deterministic Reddit
result under `output/playwright/`. Preserve the local evidence with this report when
transferring the handoff. The committed fixtures reproduce the new finding without
credentials or production infrastructure.

`output/release-qa-evidence.zip` packages the logs, JSON, screenshots and fixtures
with a SHA-256 file manifest. It is local evidence and is not part of the QA commit.

## 4. TikTok identity — D06

**PASS for fresh verified identities; FAIL for complete legacy-conflict acceptance.**
The retained real Worker/D1 regression passes for vt/vm/canonical forms submitted
through Telegram preparation and publication, with mocked safe redirects and actual
database rows. The backend additionally passes:

- Forward and reverse order, tracking variants: first 201 created, subsequent 200
  duplicate, one immutable original submitted URL on the retained publication.
- An 18-request cross-form/source-label race: one creation, 17 duplicates, one row.
- Canonical TikTok normalization to `source: TikTok` and numeric video ID; mismatched
  original/embed/provider/source ID/canonical hint rejects; other providers retain
  their separate namespaces; unresolved links do not fabricate identities.
- Soft-deleted identities remain duplicate tombstones and invisible to public reads.
- Consistent older canonical rows and valid older embed identities deduplicate
  without rewriting them; multiple legacy rows and the shipped contradictory
  short-original fixture fail closed.

However, the new independent fixture shows that a canonical-shaped legacy original
matching the incoming ID overrides contradictory metadata on that same record. Three
cases return 200 duplicate instead of 400. See section 9. D06 cannot be marked fully
accepted until these fail-closed cases pass.

Original URL preservation means preserving the first stored original and leaving it
unchanged on duplicate submission; later aliases do not become extra publications.
Short-link redirects are checked by automation. Worker ingestion checks supplied
resolved metadata structurally; it does not independently fetch or attest to the
short link's live redirect. This is the documented authenticated-writer boundary,
an **ACCEPTED LIMITATION**, not live TikTok verification.

## 5. Reddit adapter — D03 local verdict

**PASS for the exercised local adapter, rendering and security behavior. Full D03
real-world content/media acceptance remains NOT VERIFIED.**

`worker/reddit.ts` constructs the official blockquote and fixed
`https://embed.reddit.com/widgets.js` mechanism described by
[Reddit's official guide](https://support.reddithelp.com/hc/en-us/articles/360043033532-How-do-I-embed-a-Reddit-post-or-comment-in-an-article-or-other-publication).
The linked official PDF could not be retrieved by the research tool in this run;
that retrieval is not counted as fresh verification. Actual browser traffic below
confirms the official widget script ran and created its own content frame.

Supported public-post-shaped originals are reddit.com/www/old `/r/.../comments/<id>`
with optional slug, and redd.it short URLs. Comments/user/community URLs, credentials,
non-default ports, invalid IDs, mismatched structured metadata and arbitrary caller
markup cannot select the player. Both news and meme cards are eligible; recognized
originals without provider metadata also work.

Real HTTP tests inspect returned HTML/headers. Canonical adapter construction does
not fetch the post server-side. Short links use only fixed official HTTPS oEmbed,
forbid redirects, use a five-second deadline and 64 KiB response limit, discard
returned markup and retain only a validated same-ID canonical post URL. Failure
retains readable original links.

Browser tests confirm click-only adapter creation, no widget/provider requests before
click for tested cards, attribution and original/fallback links before/after loading,
news/meme behavior, and 320/390/768/1440 layouts. Visual review confirms readable
mobile and desktop cards. Deterministic 404 deleted, 403 private and 451 restricted
provider responses retain attribution/fallbacks; these are mocks, not live eligibility
checks. The fixed scrollable adapter may require internal scrolling for tall content.

Both iframe sandbox and adapter CSP omit `allow-same-origin`; the provider script
cannot read the parent DOM in Chromium. The host runs no Reddit script. Arbitrary
inline markup/scripts and unapproved frames are blocked. Only this GET adapter has
the scoped nonce/fixed-widget-script and inline-style exception; ordinary host
scripts/styles remain same-origin. Permissions policy denies autoplay; the adapter's
effective permission is false. No observed local policy weakening gives provider
code access to the host DOM. These checks do not prove real media playback behavior.

## 6. Live Reddit verification verdict

**NOT VERIFIED — category C, external Reddit HTTP restriction.** Two anonymous
unmocked browser tests used known-public posts of different types. The research
tool could read these public post pages, but that separate network is not evidence
that the local browser rendered their embeds.

| Local browser observation      | Public image post, meme publication                                                                                                 | Public text AMA, news publication                                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Original                       | [r/aww ducklings, crpjwk](https://www.reddit.com/r/aww/comments/crpjwk/every_year_this_mama_duck_brings_her_babies_to_my/)          | [r/IAmA Obama AMA, z1c9z](https://www.reddit.com/r/IAmA/comments/z1c9z/i_am_barack_obama_president_of_the_united_states/) |
| Local adapter HTTP             | 200                                                                                                                                 | 200                                                                                                                       |
| Widget script HTTP             | 200                                                                                                                                 | 200                                                                                                                       |
| Official embedded-content HTTP | **403**                                                                                                                             | **403**                                                                                                                   |
| Actual post content visible    | No                                                                                                                                  | No                                                                                                                        |
| Provider text                  | “You've been blocked by network security.”                                                                                          | Same                                                                                                                      |
| Media present                  | No image/video/audio content                                                                                                        | No image/video/audio content                                                                                              |
| Automatic media playback       | None observed; **NOT VERIFIED** without content                                                                                     | None observed; **NOT VERIFIED** without content                                                                           |
| Original links                 | Visible, safe attributes; click opens original destination; provider challenge/restriction prevents confirming content availability | Same                                                                                                                      |

The script fetched and executed, and the provider frame returned an HTTP response;
no request failure or browser CSP violation was recorded in either embed attempt.
This supports **C**, rather than an observed **A adapter failure** or **B browser/CSP
failure**, for these two outcomes. It does not establish that A/B cannot occur for
other eligible content. **D successful real-world content rendering was not observed.**

Direct original-link browser navigation encountered Reddit security/challenge pages;
an HTTP 200 challenge response is not successful original-content rendering. The
navigation works, while provider access remains unverified. Exact widget/content URLs,
HTTP statuses, DOM text, media observations and navigation results are recorded in
`reddit-live.txt`/`reddit-live.json`; screenshots are
`release-reddit-crpjwk.png` and `release-reddit-z1c9z.png`.

No credentials, private communities, scraping workaround or network/DNS changes were
used. This external restriction does not fail unrelated local tests and is not counted
as a new application defect. Do not claim D03 live success or autoplay verification.

## 7. Previous remediation and general MVP regression

| Area                             | Classification  | Fresh evidence / scope                                                                                                                                                                                                |
| -------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 originals 404/410            | PASS            | Preparation and mocked Telegram reject; real D1/feed and outgoing state stay empty. Uncertain optional metadata failure retains manual approval.                                                                      |
| D02 short TikTok                 | PASS            | vt/vm checked redirects retain canonical embed ID and original URL; private/mixed DNS and unsafe destinations reject; browser player is click-only.                                                                   |
| D04 private state                | PASS            | 0700 directory/0600 files, existing 0755 rejection without chmod, symlink/ownership/link checks, atomic replacement; foreign-owner check simulated, not real chown.                                                   |
| D05 durable retry/replay         | PASS            | 408/429/500/502/503/504/transport, bounds and Retry-After; actual committed D1 write plus new Publisher replay retains exactly one publication and clears saved recovery.                                             |
| API and migration                | PASS            | Create/read/list/delete, authentication and absent-secret fail-closed, exact duplicate keys/conflicts, migrations applied twice, schema/constraints/immutable triggers and query indexes. Unsupported methods reject. |
| Pagination/deletion/permalinks   | PASS            | Timestamp ties, concurrent insertion, deleted cursor row, invisible tombstones, idempotent deletion, older/deleted publication permalinks.                                                                            |
| Doom Monitor/frontend            | PASS            | News/video/meme/changelog, original links, inert HTML, unavailable previews, infinite scrolling/retry/deduplication, empty/error states and responsive widths.                                                        |
| Telegram/manual editorial bypass | PASS with mocks | Allowed private IDs, unauthorized/group/bot denial, publish/duplicate/delete/poll checkpoints; manual path has no AI call and preserves telegram origin.                                                              |
| Daily discovery                  | PASS with mocks | Zero selections/publications allowed, failure isolation, daily cap and repeat-run budget; no forced minimum.                                                                                                          |
| Monthly changelog                | PASS with mocks | Existing visible posts only, 156 input publications across pages, exact citations, timezone/empty-month cases, draft invalidation and idempotency.                                                                    |

No new confirmed defect was found in these other exercised paths. Mocks do not verify
live model quality, provider playback, Telegram delivery or installed OpenClaw behavior.

## 8. Security assessment

- **SEC-001: PASS** for public HTTPS preview URL validation and render-time suppression
  of unsafe stored previews, including local/private/numeric IP forms. **REQUIRES
  OWNER DECISION** for public-looking image hosts that later resolve/redirect privately:
  direct browser previews are not DNS-pinned, and `img-src https:` remains broad.
  This carried risk is not automatically accepted; no private-service exploit was tried.
- **SEC-002: PASS locally.** Real HTML/CSS/JS/SVG, missing assets, API successes/errors
  and adapter headers pass. Static and ordinary Worker policies agree. Main CSP has
  no new third-party script or inline-style exception; same-origin frames admit only
  the adapter, while other host documents retain DENY/frame-ancestors none. Production
  edge/TLS/cache/platform-generated responses remain **NOT VERIFIED**.
- **SEC-003: PASS.** All-answer DNS checks, address pinning, literal/redirect rejection,
  redirect/body bounds, late DNS and one shared redirect deadline pass without contacting
  unsafe targets. Continued OS DNS work after caller abort is an **ACCEPTED LIMITATION**.
- Auth precedes input/database access, SQL uses bound values/constraints, errors are
  sanitized, markup renders as text, and provider sources are constructed/allowlisted.
  The new legacy conflict defect affects identity correctness; these tests demonstrate
  no auth bypass, arbitrary script execution or extra row creation from that defect.

## 9. New confirmed defect — RELEASE-QA-001-D07

**FAIL; P2; TikTok legacy conflicts may return successful duplicate without review.**

Location: `worker/store.ts:152–168`, particularly the alternative
`originalId === tikTokId || embedId`. Matching legacy original A suffices even if
that row also claims a contradictory provider/embed/source identity. The approved
FIX-002 policy in `docs/api.md` requires contradictory legacy records to return 400
for data review, rather than implicitly accepting them.

Reproduce after installing/building:

```sh
node --test tests/release-qa.mjs
```

The committed fixture migrates fresh temporary D1, seeds legacy rows directly (new
ingestion correctly prevents creating these conflicts), submits a canonical video A
through authenticated real Worker HTTP and compares the unchanged database row.
Video A is `6718335390845095173`; video B is `7420000000000000001`.

| Single seeded legacy record                     | Expected                | Actual                         |
| ----------------------------------------------- | ----------------------- | ------------------------------ |
| Original A, no contradictory metadata (control) | 200 duplicate unchanged | 200 duplicate unchanged — PASS |
| Original A, TikTok embed ID/URL B               | 400 VALIDATION_ERROR    | **200 duplicate — FAIL**       |
| Original A, source TikTok/source_item_id B      | 400 VALIDATION_ERROR    | **200 duplicate — FAIL**       |
| Original A, embed ID A but embed URL B          | 400 VALIDATION_ERROR    | **200 duplicate — FAIL**       |

All cases retain one row and leave it byte-for-field unchanged. Thus this is not
reproduction of the earlier three-row failure. It is one distinct fail-closed defect
with three reproductions; runner parent failure is not a fourth defect. A successful
duplicate can falsely tell Telegram that contradictory content already exists, leaving
historical ambiguity undisclosed. Fresh valid ingestion/races remain functional.

Evidence: `legacy-identities.json` contains expected/actual status, full response,
before/after row and row count. Both independent runs reproduce the same failures.
Recommended correction: require agreement of every present recognized identity on
the selected legacy row before returning duplicate; preserve immutability/tombstones
and reject contradiction for review. Retain these tests and rerun them plus the existing
D06 suite. No application correction was made in this QA task.

## 10. External limitations and owner decisions

- **NOT VERIFIED:** real Reddit content/media/no-autoplay, other providers' live
  playback/consent/eligibility, Safari/Firefox/physical devices, full assistive-technology
  review, long-duration operation and production-volume/Free-limit performance.
- **NOT VERIFIED:** deployed Cloudflare edge/TLS/remote D1/migration/cache behavior,
  actual Telegram polling owner/bot delivery, installed OpenClaw lifecycle/schedules,
  editorial/translation/factual quality and model large-context capacity.
- **REQUIRES OWNER DECISION:** carried browser-preview DNS/redirect exposure and any
  proposed launch exception to successful live Reddit acceptance. No waiver is assumed.
- **ACCEPTED LIMITATION:** keyset pagination is not a snapshot; monthly reference
  visibility is checked before POST and is not atomic with concurrent deletion;
  representative regex source parsing is not a full XML parser; state replacement
  is not power-loss/fsync assurance; stale locks need operator recovery. These are
  documented boundaries, not newly observed failures in this run.

## 11. Separate release readiness assessments

**LOCAL MVP READINESS — FAIL / NO-GO for unconditional staging acceptance.** Most
local functionality, D03 adapter isolation and prior remediation pass. The explicit
legacy-conflict requirement fails reproducibly, so FIX-002/D06 acceptance is incomplete.
A fresh-data diagnostic staging exercise might still be useful, but does not erase the
failed requirement and would require an explicit owner exception. Reddit's external
403 alone is not the reason for this local no-go.

**PRODUCTION READINESS — FAIL / NO-GO for public launch.** In addition to D07,
live Reddit rendering/media/autoplay remains NOT VERIFIED, preview risk needs owner
decision, and deployed edge/remote data/live automation checks remain outstanding.
Passing local simulation is not production acceptance or deployment authorization.

## 12. Recommended next actions

1. Remediate **D07** within the existing approved identity policy. Preserve original
   rows/tombstones and reject all present contradictory recognized legacy identifiers.
   Run `node --test tests/release-qa.mjs`, retained `tests/regression-001.mjs`, backend
   integration/browser suites, automation suite, `npm run validate` and `npm run build`.
   Obtain independent reassessment before unconditional staging sign-off.
2. Repeat anonymous legitimate Reddit browser testing in an environment where Reddit
   permits access, using the two public posts above and an eligible playable-media post.
   Record script/content statuses, visible content/media, pre-click requests, actual
   autoplay behavior and working original content links. If still restricted, retain
   NOT VERIFIED or obtain a documented owner launch-scope decision; do not bypass it.
3. Have the owner explicitly decide the direct-preview DNS/redirect risk and review
   existing historical TikTok collisions before importing data. No implicit merge or
   backfill is authorized by this report.
4. After local acceptance, separately authorize staging infrastructure and deployed
   edge/TLS/header/cache/remote D1 migration/auth/CRUD checks with reviewed secrets and
   rollback plan. Separately authorize intended-host Telegram/OpenClaw and scheduling
   verification, then provider/browser/device checks before public launch.

Commit delivery is limited to this report and `tests/release-qa.mjs` /
`tests/release-qa.browser.mjs` on `qa/release-candidate`. The handoff supplies the QA
commit SHA; it is distinct from the audited application baseline above.
