# QA-001 — Independent MVP Acceptance Report

## 1. Executive Summary

**Verdict: NOT READY for production acceptance.** The integrated local MVP builds,
serves its feed and passes the existing regression suites, but independent acceptance
checks reproduced five defects. QA-001-D01 is P1: a confirmed HTTP 404/410 original
URL is published instead of rejected. Four P2 defects concern short TikTok embeds,
missing Reddit rendering, existing state-directory permissions and discarded retry
payloads after HTTP 502/504.

Audit date: **12 October 2026, Asia/Bangkok**. Audited application baseline:
**`c1154e1`**, checked out on **`qa/mvp`**. Application code was not changed. No
production deployment, DNS action, bot registration, live OpenClaw change or merge
was performed. Prior developers' reports were treated as claims and independently
rerun or challenged.

Fresh regression results: 66 unit tests passed, one build smoke test passed and
nine backend integration subtests passed (10 runner entries including their parent).
The browser-enabled integration rerun passed ten subtests (11 runner entries),
including 23 browser assertions. The existing frontend browser function passed 34
assertions, and independent Chromium checks passed another 28 assertions.

The two additional audit fixtures executed **41 grouped scenarios: 32 passed and
nine failed acceptance expectations**, mapping to the five defects below. These
counts overlap with the browser checks and must not be added into one purported
unique test total. A passing assertion that observes the missing Reddit button is
evidence of the defect, not acceptance of that behavior.

## 2. Scope and Environment

Read `AGENTS.md`, `README.md`, `docs/api.md`, `docs/architecture.md`,
`docs/decisions.md` and `docs/handoff.md`; reviewed implementation in `worker/`,
`src/`, `automation/`, `shared/`, `db/` and `tests/`. Additional references included
component setup guides, deployment prerequisites, OpenClaw prompts and plugin code.
The dedicated editorial workspace instructions were reviewed as product artifacts,
not instructions authorizing this auditor to run live automation.

Environment:

- macOS arm64; Node **v24.15.0**, npm **11.12.1**.
- Installed lockfile dependencies with `npm ci`: 395 packages installed; npm reported
  zero vulnerabilities. This is the install audit result, not a guarantee that every
  dependency is secure.
- Astro **7.3.8**, Wrangler **4.149.0**, local workerd/D1; strict migration
  `db/migrations/0001_posts.sql` applied to fresh isolated databases.
- Chromium from the existing Playwright cache; separate CLI session `qa001`.
- Real Worker servers used dynamically allocated loopback ports with inspector
  port 0, `remote: false`, sentinel database IDs and temporary local credentials.
  The independently authored HTTP fixture used port 62779 in its recorded run.
  See `output/qa/runtime.json` for the actual recorded port if reproducing evidence.
- D1, automation state, generated configuration and tool preferences used temporary
  directories outside the repository. Worker tests disabled environment-file loading;
  inherited Cloudflare credentials were removed from the test environment.
- Separate Astro preview used port **62883**. Existing services on 4321, 8787 and
  8797 were left untouched. The QA Worker instances, Astro process and `qa001`
  browser were stopped; temporary database/state/configuration directories removed.
- Telegram, AI and source responses were fixtures. Security transport tests replaced
  DNS and socket functions; **no private/internal target was contacted**.

The frontend acceptance screenshots show deliberately synthetic publications stored
through the real local API. External players/images were blocked or mocked for
browser assertions. They are not evidence that third-party playback works.

## 3. Tests Executed

### Commands and actual outcomes

Commands were run from `/Users/mikemmagik/Documents/waagd-qa`.

| Command/check                                                         | Outcome                                                                                                          | Evidence                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `npm ci`                                                              | Exit 0; 395 packages installed; zero reported vulnerabilities                                                    | `output/qa/npm-ci.log`                                  |
| `npm run validate`                                                    | Exit 0; Astro 0 errors/warnings; TypeScript, ESLint, formatting; 66 units, smoke and local D1 integration passed | `output/qa/validate.log`                                |
| `npm run build`                                                       | Exit 0; static Astro build and Worker dry-run bundle; no deployment                                              | `output/qa/build.log`                                   |
| `node output/qa/independent.mjs`                                      | Exit 1 **expected from confirmed acceptance failures**; 25 passed/6 failed grouped scenarios                     | `output/qa/independent.log`, `independent-results.json` |
| `node output/qa/network-fixtures.mjs`                                 | Exit 1 **expected from confirmed acceptance failures**; 7 passed/3 failed grouped scenarios                      | `output/qa/network.log`, `network-results.json`         |
| `node output/qa/shipped-browser-runner.mjs`                           | Exit 0; original `verifyMonitor` function, 34 assertions                                                         | `output/qa/shipped-browser.log`                         |
| `WAAGD_BROWSER_TESTS=1 node --test output/qa/backend-browser.test.ts` | Exit 0; 11 entries including parent; 23 real API browser assertions                                              | `output/qa/backend-browser.log`                         |
| `node output/qa/security-inspection.mjs`                              | Exit 0; records accepted loopback preview metadata, without fetching it                                          | `output/qa/preview-risk.json`                           |
| Report formatting and source diff verification                        | Report formatted; application paths compared with baseline                                                       | See final handoff/commit                                |

The shipped browser runners hardcode session `doom` and frontend port 4321, both
already in use. Audit wrappers changed only the fixture session/port and copied
integration-fixture import/root paths into ignored `output/qa/`. They exercised the
original assertions against this checkout. The unmodified `npm run test:browser`
command was **not** run against the owner's existing browser/server. An initial
wrapper attempt hit a stale routing rule from the previous audit scenario and
failed; clearing that fixture rule produced the recorded passing rerun. The network
fixture's lookup counter was also corrected before the final recorded results.
Neither issue required application changes.

### Coverage matrix

| Area              | Independently executed coverage and limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend           | Empty feed; create/get; unauthorized POST/DELETE; strict payloads, nested fields, malformed JSON; 256 KiB byte limit including chunked input; tracking normalization; source/provider identifiers; concurrent duplicates; permanent tombstones; URL-less changelog; missing/deleted item 404; invalid cursors; equal-timestamp order, new insertion and deletion of cursor row; actual D1 errors sanitized. Migration/index/constraint/trigger behavior was exercised against D1, not an in-memory replacement. |
| Frontend          | Initial busy state; empty response; all four types; infinite scrolling; one render per ID; older permalink outside first page; deleted permalink; HTML/script text; broken/missing previews; 298-code-unit title; Chinese/emoji; API failure and successful retry; click-only YouTube/TikTok construction; fallback links; autoplay query and permission; 375/768/1440 overflow checks. Existing suites additionally checked 320/390, pagination failure/cursor recovery and development fixtures.              |
| Telegram          | Allowed private user; unauthorized user, bots, group, malformed update; missing/non-text messages; malformed URLs/deletion command; original URL preservation; manual publishing without editorial AI; neutral missing-metadata fallback; creation, duplicate, deletion, tombstone; mocked polling checkpoint/shutdown and Bot API envelopes. 404/410 originals failed acceptance.                                                                                                                              |
| Discovery         | Source configuration/types/duplicate names; RSS and Atom; invalid root, entity/DOCTYPE rejection, bad entries, malformed JSON source isolation; unavailable source and simulated timeout; healthy-source continuation; duplicate candidates/known publications; zero selection; unknown/duplicate/oversized AI selections; daily cap; failed publication continuation and outbox recovery. No live editorial-quality experiment.                                                                                |
| Monthly           | Previous month, December/January and configured timezone boundaries; empty month; one-source generation; 156 sources over two mocked API pages in rerun regression; independently 104 eligible historical D1 posts across actual API pages; deletions/other changelogs excluded; citation IDs and readable permalinks; fresh-state duplicate monthly rerun; saved draft/retry and deletion invalidation; invalid output; API failure. Only supplied existing publications entered generation.                   |
| Security/recovery | Auth fail-closed units and HTTP denial; bound SQL/uniqueness; strict embed fields/provider hosts; inert text; literal localhost/private/metadata/mapped-IP and numeric/hex encodings; mixed DNS rejection; pinned checked address; public redirects rechecked; private redirect rejected before socket; bounded redirect loop/2 MB document; no outbound auth; 503/429 retry/Retry-After; private new state/files; permissive existing directory; 502/504 payload loss.                                         |

## 4. Results

The backend's documented contract is coherent across actual consumers. Atomic D1
uniqueness and tuple pagination behaved correctly in the exercised cases. Concurrent
tracking variants created one row and 15 duplicates in the independent fixture;
existing regressions separately exercised three 12-request duplicate races. Repeated
deletes preserve the timestamp, hide the item/feed and never restore a tombstone.

Provider identifiers deduplicate when supplied as `(source, source_item_id)`.
Cross-form YouTube/short-link equivalence without that identity is not promised by
contract v1 (`docs/api.md:250` explicitly declines inferred provider equivalence).
It is therefore not reported as an API defect.

Frontend reads and recovery worked in Chromium. Visual inspection of the three
requested widths confirmed the dark terminal treatment, readable main headlines,
red accents, thin separators and one chronological feed with no accounts,
categories, filters, comments, reactions, share controls or CMS. The implementation
uses text/media columns inside desktop cards and two columns inside desktop release
notes, collapsing on mobile. This is a possible interpretation gap in the requested
"single column" direction; no supplied visual reference establishes that every
card's internal content must also be one column. It is **not counted as a confirmed
defect**. Small decorative labels warrant real-device review but no observed overflow
or proven readability failure is claimed.

Daily selection accepts zero items. Three to five items is a target, with a persisted
maximum of five selections, not a mandatory quota. Manual Telegram URLs bypass AI
classification and retain `origin: telegram`.

Monthly generation received every eligible publication in the exercised reporting
month; reference limits did not truncate its input. Output validation rejects unknown
IDs, missing/mismatched citations and invalid lengths. Satire's factual correctness
cannot be established using deterministic mock output alone.

### Screenshots and evidence delivery

- [Desktop, 1440 px](../output/qa/viewport-1440-top.png)
- [Mobile, 375 px](../output/qa/viewport-375-top.png)
- [Tablet, 768 px](../output/qa/viewport-768-top.png)
- Full feed captures: `output/qa/viewport-{375,768,1440}.png`.
- Empty state: `output/qa/empty-desktop.png`.
- Failure state: `output/qa/error-desktop.png` (1440 px).
- Additional original-suite imagery: `output/playwright/`.
- Complete local evidence archive: `output/qa-evidence.zip`, containing fixtures,
  final logs, JSON results, screenshots and a SHA-256 manifest.

Evidence under ignored `output/` is delivered locally and is not part of the report
commit. Preserve the archive with this report for review on another machine. The
reproduction steps below remain self-contained even without the local archive.

## 5. Confirmed Defects

| ID         | Severity | Affected component            | Summary                                                     |
| ---------- | -------- | ----------------------------- | ----------------------------------------------------------- |
| QA-001-D01 | P1       | Telegram metadata/publication | Confirmed missing original content is published             |
| QA-001-D02 | P2       | HTTP metadata and TikTok      | Successful short-link redirect loses structured video embed |
| QA-001-D03 | P2       | Frontend provider renderer    | Reddit always lacks inline rendering                        |
| QA-001-D04 | P2       | Local automation state        | Existing non-private directory is accepted unchanged        |
| QA-001-D05 | P2       | HTTP retries/outbox           | 502/504 discard publication recovery payload                |

### QA-001-D01 — Confirmed missing original URL publishes

- **Location:** `automation/core/metadata.ts:141`, `:148`, `:153`;
  `automation/core/http.ts:69`; `automation/telegram/handler.ts:48`.
- **Reproduction:** Start a migrated isolated Worker/D1 and `Publisher`. Call
  `handleUpdate` with allowed user 123, matching private chat 123, and
  `https://example.com/gone-404`; inject metadata HTTP returning status 404. Repeat
  with `gone-410` returning 410. Query the real API after each update.
- **Expected:** A confirmed permanently missing original produces FAILED and no
  new publication. An available original with no metadata can still publish a
  neutral title; a blocked/uncertain response must not be equated with confirmed removal.
- **Actual:** Both calls reply PUBLISHED and add one visible D1 row, using
  `example.com` as title. `prepareUrl` swallows all `RequestFailure` values,
  including permanent original 404/410.
- **Evidence:** Two failing scenarios in `independent-results.json` record
  `rowsAdded: 1` and PUBLISHED. Existing regression at
  `automation/tests/automation.test.ts:1049` expects publication preparation after
  a mocked 404, explaining why a green regression suite does not cover this requirement.
- **Recommended correction:** Preserve original-fetch failure classification;
  reject confirmed original 404/410 while retaining optional-metadata fallback.
  Keep unsafe-target failures closed and manual submissions free of editorial gates.
  Update the conflicting regression and add end-to-end no-row assertions.

### QA-001-D02 — Short TikTok redirects cannot yield structured embeds

- **Location:** `automation/core/http.ts:178`, `:194`, `:197`;
  `automation/core/metadata.ts:96`, `:114`, `:153`.
- **Reproduction:** In a safe intercepted transport fixture, return 302 from
  `https://vt.tiktok.com/fixture/` to
  `https://www.tiktok.com/@qa/video/6718335390845095173`, then 200 HTML. Invoke
  `prepareUrl`; repeat for `vm.tiktok.com`. No live provider/socket is required.
- **Expected:** Preserve `post.url` exactly as submitted, but use the independently
  checked resolved public provider URL/ID for structured embed metadata and video type.
- **Actual:** Both short hostnames produce `type: news`, `embed.kind: link` and
  no player. `publicHttp` follows/checks the redirect but returns a synthetic
  Response with empty `url`; `prepareUrl` derives the embed solely from the input.
  Even a mocked Response exposing the final URL is ignored.
- **Evidence:** Two independent preparation failures and one intercepted-transport
  failure; network evidence records both checked requests and the link-only payload.
  A direct supported TikTok URL rendered a click-loaded player in Chromium.
  The [official TikTok player documentation](https://developers.tiktok.com/docs/en/embed-player)
  documents construction from the public post ID and autoplay control.
- **Recommended correction:** Expose a checked final URL within the existing
  HTTP/metadata boundary and derive provider fields from it. Keep the original
  submitted URL. Retain every literal, DNS, address-pinning and redirect check;
  reject private destinations before any request. Coordinate any shared-contract change.

### QA-001-D03 — Reddit metadata has no inline renderer

- **Location:** `src/lib/presentation.ts:63`;
  `src/lib/render.ts:58`; `automation/core/metadata.ts:91`.
- **Reproduction:** Create structured Reddit metadata for
  `https://www.reddit.com/r/test/comments/abc123/title/`. Call `playerFor`, then
  publish/render that fixture through the actual local API and homepage.
- **Expected:** Eligible supported public Reddit content offers click-to-load inline
  rendering with attribution; unavailable/restricted content retains original links.
- **Actual:** Metadata contains `provider: reddit`, but `playerFor` returns null for
  every Reddit input. With news/no preview, the card has only title/source links and
  no load control. No provider request or eligibility attempt occurs.
- **Evidence:** Independent renderer assertion fails; real browser records zero
  Reddit load buttons. [Reddit's official embedding guide](https://support.reddithelp.com/hc/en-us/articles/360043033532-How-do-I-embed-a-Reddit-post-or-comment-in-an-article-or-other-publication)
  describes supported embeds/oEmbed. This establishes that a provider mechanism
  exists, not that this synthetic post or every real post is eligible.
- **Recommended correction:** Add a reviewed allowlisted renderer for eligible
  Reddit content, constructed from validated provider metadata and loaded on click.
  Preserve fallback and platform restrictions; do not inject arbitrary upstream HTML.
  Coordinate renderer/CSP needs. Real provider eligibility/playback remains unverified.

### QA-001-D04 — Existing state directory remains non-private

- **Location:** `automation/core/state.ts:36`, `:48`;
  `automation/config.ts:13`.
- **Reproduction:** Create a fresh temporary directory with mode 0755 outside the
  repository. Pass it to `State`; call `write('x.json', {fixture: true})` and inspect
  its mode. Configuration accepts an absolute outside-repository path without a
  permission/ownership check.
- **Expected:** A directory used as private automation state is 0700 or rejected
  with an actionable setup failure.
- **Actual:** Directory remains 0755. Recursive `mkdir` applies mode only when it
  creates a directory. The new JSON file is correctly 0600.
- **Evidence:** Independent mode assertion records decimal 493 (0755), expected
  448 (0700); the new-directory 0700/new-file 0600 control passed.
- **Security impact:** Directory names/workflow information can be visible to other
  local users. A preexisting writable directory could permit state replacement;
  that exploit was not attempted. This is a conditional local hardening defect,
  not a demonstrated remote compromise or proof that 0600 contents were read.
- **Recommended correction:** Validate existing directory ownership, mode and
  symlink handling before reading/writing state. Reject unsafe state with a clear
  setup instruction, or correct permissions only on the explicitly configured,
  verified owner-controlled directory.

### QA-001-D05 — Transient gateway errors lose durable retries

- **Location:** `automation/core/http.ts:69`;
  `automation/core/state.ts:104`.
- **Reproduction:** Use a fresh temporary State and Api with an injected HTTP
  response of 502. Submit a valid publication through Publisher; inspect files and
  run replay. Repeat for 504.
- **Expected:** Temporary gateway failure retains the exact payload for bounded
  recovery, even when immediate retry is exhausted or unsafe to repeat immediately.
- **Actual:** 502/504 are classified `retryable: false`; Publisher removes the
  saved outgoing file. No automatic replay can recover it. The generic Telegram
  error message still says temporary failures are saved, which is false in this case.
- **Evidence:** Two network-fixture failures record `{status: 502/504, files: [],
recovery: "payload removed"}`. No real gateway was contacted.
- **Recommended correction:** Review transient status classification, including
  502/504; retain uncertain publication payloads and honor bounds/backoff. Permanent
  auth/validation failures should remain excluded. Add tests for file retention,
  later replay and truthful Telegram failure messaging.

## 6. Security Findings

**No P0 vulnerability was demonstrated in this audit.** This is a statement of
observed evidence, not a security certification.

Verified protections: bearer authentication before input/database work; absent-token
fail-closed units; constant-time native credential verification; bound queries and
atomic database uniqueness; byte-counted request bodies; sanitized error envelopes;
strict metadata fields; inert text; constructed allowlisted iframe sources; click-only
players with sandbox/autoplay denial; external link `noopener noreferrer`; outbound
metadata requests omit credentials; all returned DNS addresses checked and one pinned;
private redirects rejected before a second socket; bounded redirects/documents.

Confirmed local-state hardening defect: **QA-001-D04**.

Additional risks and gaps, **not added to the confirmed defect count**:

- **Untrusted preview targets:** `extractMetadata` accepts a loopback `og:image`
  URL (`automation/core/metadata.ts:60`), and frontend `safeUrl` accepts it.
  `preview-risk.json` records `http://127.0.0.1:59999/local-preview`. The browser
  renderer assigns accepted preview URLs to image sources. Private-service access,
  response disclosure and browser policy bypass were not tested or demonstrated.
  Review public-target/HTTPS image policy and browser-local request exposure before
  production; this does not establish server-side SSRF.
- **DNS lookup deadline:** `automation/core/http.ts:127` awaits DNS before creating
  the request that uses AbortSignal. A pathological resolver stall may outlive the
  HTTP timeout. Address pinning still mitigates rebinding; no real stalled resolver
  experiment was performed.
- **Production headers/CSP:** `src/README.md:53`, `docs/api.md:101` and
  `docs/deployment.md` mention the three current frame origins and a review gate,
  but supply no complete enforceable production CSP/header policy. No `_headers`
  file or Worker HTML-header implementation exists in this checkout. A deployed
  edge policy, CSP enforcement, HTTPS/HSTS and browser-policy compatibility remain
  unverified. The documentation is insufficient for claiming production completion.
- **Monthly deletion race:** Citation visibility is checked before submission,
  without an atomic check at final POST. Concurrent deletion may leave a just-created
  changelog referring to a deleted material. This is an acknowledged API consistency
  limitation; the precise concurrent race was not reproduced, so it is a risk rather
  than a confirmed occurrence.
- **Prompt/model boundary:** AI runs remove the two project credential variables,
  use a private input file and new session, and validate selected IDs/output shapes.
  Prompts prohibit external research/tools. Enforcement by the installed OpenClaw
  agent and resistance to model prompt injection require live-host verification.

## 7. Product Requirement Deviations

Confirmed deviations are original availability handling (D01), supported short TikTok
embedding (D02), absent Reddit rendering capability (D03) and retry durability (D05).
State privacy failure (D04) is an operational security deviation.

The basic one-feed/no-visitor-controls product boundary holds in inspected code and
screenshots. Manual URLs bypass editorial filtering. The daily target is not treated
as a quota. Monthly generation uses existing published material with validated IDs;
no independent external news research was performed.

A desktop card's internal two-column layout is recorded as a design interpretation
question, not presumed disapproval or a confirmed violation. Lightweight Markdown is
rendered safely as text; inline `[post:<uuid>]` markers stay literal and references
are separately clickable. Rich Markdown/inline citation conversion is not promised
by the existing renderer contract and is not counted as a defect.

## 8. External Integration Limitations

- No real Telegram bot/polling network was used. Authorization, messages and
  checkpoint/retry behavior were exercised with fixtures and the real local API.
- No installed OpenClaw agent, Gateway plugin lifecycle or production schedule was
  exercised. Fake executable tests verify invocation shape and private input; they
  do not prove that the installed CLI supports the supplied flags/SDK.
- Actual YouTube, TikTok, Instagram or Reddit content playback, permissions,
  geographic restrictions, cookies and provider removal/embeddability remain
  unverified. Browser tests validate construction, user activation and fallbacks.
  Official provider docs establish mechanisms only.
- Real model factual fidelity, translation quality, editorial suitability and large
  production context capacity are unverified. Deterministic citation validation
  cannot prove that every assertion is supported semantically.
- Source tests cover representative RSS/Atom/JSON and failures, not all XML variants.
  The regex-based parser is not a complete XML parser; comprehensive malformed XML
  acceptance, compression/encoding variants and real source behavior remain limited.
- Cloudflare remote D1, global network/edge behavior, Free plan limits under production
  load and live security headers were not tested. Local D1 verifies SQL behavior,
  not deployed availability/performance.
- Full browser coverage is Chromium only; Safari, Firefox, physical mobile devices,
  assistive-technology testing and long-duration polling/load tests were not performed.
- Stale locks after forced termination and exhausted retries require documented manual
  recovery. No changes were made to live user configuration to test those operations.

## 9. Production Readiness Assessment

**NO-GO for production acceptance at `c1154e1`.** Passing build/regression results
show a functioning local integration, but cannot override D01's explicit requirement
failure or substitute for production configuration and actual-host verification.

Before acceptance, correct D01; resolve or explicitly approve scope decisions for
D02/D03; correct D04/D05; rerun targeted acceptance reproductions and local browser/
D1 regression. Complete the production CSP/header design and the installed-host
OpenClaw/Telegram checks in a separately authorized deployment preparation task.
Validate selected real public provider embeds without bypassing platform restrictions.
Any accepted deferral should be recorded explicitly with its impact.

No merge, deployment, DNS or live bot action is recommended as part of this audit.

## 10. Recommended Next Actions

1. **P1: D01** — prevent publication of confirmed 404/410 originals; repair the
   regression that currently expects the wrong behavior.
2. **P2: D05** — preserve payloads for transient gateway failures and prove recovery
   after a later successful request.
3. **P2: D02** — carry checked redirect identity into TikTok metadata, preserving
   original links and SSRF controls.
4. **P2: D03** — implement reviewed Reddit inline support for eligible content or
   obtain explicit approval to defer it; distinguish eligibility failures from code gaps.
5. **P2: D04** — fail closed on unsafe preexisting private-state directories.
6. Record a complete production header/CSP policy, review preview target handling and
   DNS deadlines, and verify actual OpenClaw/Telegram/provider behavior on the intended
   host without using this audit's temporary credentials.
7. Rerun targeted defects, `npm run validate`, builds and browser acceptance after
   approved corrections. Preserve evidence and reassess production readiness.

Only this report is committed on `qa/mvp`. Application implementation, contracts,
database migrations, existing tests and dependency lockfile remain at the audited
baseline. The evidence archive and screenshots are separate local deliverables.
