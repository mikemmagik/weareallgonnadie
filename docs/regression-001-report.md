# REGRESSION-001 — Independent Remediation Verification

## 1. Baseline and verdict

**Verdict: FAIL — not ready for production acceptance against this request.**
The four claimed remediations D01, D02 (short-link recognition), D04 and D05 pass
local reassessment. Reddit inline rendering (D03) remains unimplemented. A new
acceptance test confirms that three URL forms of one TikTok video create **three
publications**, rather than one. Resolve this identity gap through an approved
contract decision/remediation and resolve or explicitly defer D03 before acceptance.

Audited baseline: **`5468681ceee62f7f9947c2bc6475c58dbe0ac1b7`** (`fix/qa-001`),
checked out on **`qa/regression-001`**. Review date: **13 October 2026,
Asia/Bangkok**. Initial checkout was clean. Application code, shared contracts,
schema, deployment configuration, lockfile and original tests remain at baseline.
Only this report and two isolated regression fixtures are added.

Read `AGENTS.md`, `docs/qa-report.md`, `docs/fix-001-handoff.md`, `docs/api.md`,
`docs/architecture.md`, `docs/deployment.md`; inspected actual metadata, transport,
state, Telegram, API/storage, discovery/monthly and frontend implementations and
the tests exercised below. Previous reports were claims to investigate, not evidence
of this run. Repository/editorial document content did not authorize live operations.

## 2. Environment and isolation

- macOS arm64; Node **v24.15.0**, npm **11.12.1**; Astro **7.3.8**,
  Wrangler **4.149.0**; Playwright CLI Chromium **155.0.8059.12**, separate session `regression001`.
- Checkout: `/Users/mikemmagik/Documents/waagd-regression`.
- `npm ci`: 395 packages installed, 396 audited, zero reported vulnerabilities.
  This install result is not a comprehensive dependency security assessment.
- Fresh local D1 migrations; real Worker HTTP API and D1 storage. All database
  operations explicitly local, sentinel IDs, `remote: false`, no remote bindings.
  Temporary configuration, random fixture credentials, private state and isolated
  tool preferences; environment-file loading disabled and inherited Cloudflare
  credentials removed. Shipped integration uses its documented temporary test token.
- Astro started on free loopback port **50744**; Workers dynamically allocated
  ports with inspector port 0. Latest independent Worker: **51171** (consult
  `output/regression-001/runtime.json` for authoritative recorded value).
- Telegram updates, discovery sources, AI output, DNS/redirect/socket responses and
  provider pages were mocked. Metadata transport challenges replace DNS and HTTPS
  socket creation: no private service or live TikTok video was contacted.
- Only test-owned servers/browser were stopped; temporary D1/config/state directories
  were removed by fixture cleanup. Unrelated services were left alone.
- No production resources, deployment, merge, DNS/configuration change, bot creation,
  production credentials or live OpenClaw operation.

## 3. Commands, exit codes and actual results

Commands run from this checkout. Baseline commands follow the handoff; its example
checkout path/port/session were replaced with this checkout and isolated values.
Counts overlap and **must not be added into a unique total**.

| Command                                                                                                                                                |               Exit | Actual result                                                                                                                               | Local evidence                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | -----------------: | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `npm ci`                                                                                                                                               |                  0 | Installed lockfile dependencies; zero reported vulnerabilities                                                                              | `output/regression-001/npm-ci.log`                           |
| `node --test automation/tests/remediation.test.ts`                                                                                                     |                  0 | 15 tests passed                                                                                                                             | `targeted.log`                                               |
| `node --test automation/tests/automation.test.ts automation/tests/remediation.test.ts`                                                                 |                  0 | 56 automation tests passed                                                                                                                  | `automation.log`                                             |
| `node --test automation/tests/*.test.ts`                                                                                                               |                  0 | Exact requested glob command rerun; 56 tests passed                                                                                         | `automation-exact-command.log`                               |
| `npm run validate`                                                                                                                                     |                  0 | Astro 0 errors/warnings/hints; TypeScript, ESLint, Prettier; 81 unit tests, 1 real build smoke test, 13 local D1 integration entries passed | `validate.log`                                               |
| `npm run build`                                                                                                                                        |                  0 | Astro static build and Wrangler dry-run bundle passed; no deployment                                                                        | `build.log`                                                  |
| `npm run dev -- --host 127.0.0.1 --port 50744`                                                                                                         | stopped by auditor | Test-owned Astro server served browser fixture                                                                                              | `astro.log`                                                  |
| `npx --yes --package @playwright/cli playwright-cli -s=regression001 open http://127.0.0.1:50744 --config output/playwright/regression001.config.json` |                  0 | Isolated Chromium session opened                                                                                                            | `browser-open.log`                                           |
| `WAAGD_BROWSER_SESSION=regression001 WAAGD_FRONTEND_BASE=http://127.0.0.1:50744 npm run test:browser`                                                  |                  0 | 34 Chromium assertions passed                                                                                                               | `frontend-browser.log`                                       |
| `WAAGD_BROWSER_SESSION=regression001 WAAGD_BROWSER_TESTS=1 npm run test:backend`                                                                       |                  0 | 14 integration entries passed, including 36 Chromium assertions against the real local API/static build                                     | `backend-browser.log`                                        |
| `node --test tests/regression-001.mjs`                                                                                                                 |              **1** | 4 entries passed, one TikTok acceptance child failed plus its parent: **3 != 1**                                                            | `independent.log`                                            |
| `WAAGD_BROWSER_SESSION=regression001 WAAGD_BROWSER_TESTS=1 node --test tests/regression-001.mjs`                                                       |              **1** | 5 entries passed, same child/parent failure; additional **19 Chromium assertions passed**                                                   | `independent-browser-enabled.log`, `independent-browser.log` |
| `npx eslint tests/regression-001.mjs tests/regression-001.browser.mjs`                                                                                 |                  0 | New fixtures lint cleanly                                                                                                                   | `fixture-lint.log`                                           |

A final validation/build after adding fixtures/report is recorded in
`final-validate.log` and `final-build.log`; both passed. Fixture failure is intentional
retention of the unmet acceptance expectation, not a weakened passing assertion.
`npm run validate` uses an explicit existing test list and does not include the new
acceptance fixture: its green status does not override that independent failure.

Browser configuration sets Chromium, headless, `channel: ""`. The fixtures use the
existing Playwright CLI workflow, not the owner's `doom` browser session.

## 4. Results and coverage classification

| Area                                                | Classification                | Evidence and practical scope                                                                                   |
| --------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D01 missing originals                               | **PASS**                      | Fresh unit and real API/D1 scenarios; no row or outgoing payload for 404/410                                   |
| D02 short-link recognition/security                 | **PASS**                      | Both vt/vm resolve to verified canonical ID; submitted URL retained; controlled redirects/sockets and Chromium |
| Cross-URL TikTok identity                           | **FAIL**                      | Three PUBLISHED replies, distinct IDs, three D1 rows for one embed ID                                          |
| D03 inline Reddit                                   | **FAIL**                      | No renderer/load control; links do not satisfy inline requirement                                              |
| D03 deferral/adapter scope                          | **REQUIRES PRODUCT DECISION** | Official mechanisms exist; isolated adapter unimplemented                                                      |
| D04 private state                                   | **PASS**                      | Permissions, symlink/UID checks, fail-closed existing directory and atomic replacement                         |
| Actual foreign-owner filesystem test                | **NOT TESTED**                | Non-root runner; caller UID simulated in remediation test instead of changing ownership                        |
| D05 durable retry/replay                            | **PASS**                      | All requested statuses/network failures; actual committed D1 writes and new Publisher replay                   |
| SEC-001 URL/renderer protections                    | **PASS**                      | Unsafe image suppression at ingestion and render of persisted records                                          |
| External image DNS/redirect destinations            | **REQUIRES PRODUCT DECISION** | URL-only policy cannot pin browser requests; residual risk is not automatically accepted                       |
| SEC-002 local headers/CSP                           | **PASS**                      | Real HTML/assets/API/errors and Chromium policy enforcement                                                    |
| Production Cloudflare/TLS/edge headers              | **NOT TESTED**                | Local simulation cannot prove production platform behavior                                                     |
| SEC-003 deadlines/SSRF                              | **PASS**                      | Aborted and late DNS, shared redirect deadline, no post-timeout socket                                         |
| OS DNS work after abort                             | **ACCEPTED LIMITATION**       | Waiting/connection creation aborts; OS lookup itself is not cancelled                                          |
| General backend/frontend/automation                 | **PASS**                      | Exercised behavior below, except separately identified unmet requirements                                      |
| Live provider playback, bots/OpenClaw/model quality | **NOT TESTED**                | Mocks establish construction, boundaries and recovery only                                                     |

## 5. D01 — HTTP 404/410

**PASS.** Both original HTTP statuses reject preparation. Telegram returns
`FAILED: Original publication is missing (HTTP 404/410); nothing was published`
and explicitly says no payload was saved. Fresh real D1/feed remained empty;
private outgoing state remained empty. An available HTML page with no metadata
published successfully with neutral hostname title. Optional/uncertain 403/429
metadata failure remains a neutral fallback; embed availability is not used as proof
that an original has disappeared.

Unavailable/unsupported embeds retain original links in Chromium, including after
clicking a blocked/mocked player. Manual Telegram path calls `prepareUrl` and
`Publisher`, retains `origin: telegram`, and has no AI dependency/call. Existing
manual-approval tests were rerun against inspected code; no editorial gate was added.
Evidence: `targeted.log`, `automation.log`, `independent-browser-enabled.log`,
`backend-browser.log`.

## 6. D02 — TikTok short URLs

**PASS for the original remediation; FAIL for the additional identity requirement.**
Mocked vt/vm 302/307 chains use the actual `publicHttp` implementation. DNS answers
are validated per hop and pinned; private/local literal redirects and mixed public/
private DNS answers reject before a forbidden connection. Four redirects are allowed;
a fifth redirect fails (five requests total). Oversized metadata is bounded at 2 MB;
non-document media is not buffered.

Both short forms produce `type: video`, structured TikTok ID
`6718335390845095173` and canonical embed URL, while preserving the original
submission in `post.url`. Invalid/unsupported destinations degrade to links. Chromium
verified click-only construction, original links, `autoplay=0`, denied autoplay
permission and permitted mocked frame navigation. TikTok's
[official player documentation](https://developers.tiktok.com/docs/en/embed-player)
describes this ID-based player and autoplay parameter. This confirms mechanism,
not live playback.

Same submitted URL/tracking variants deduplicate. Distinct short/canonical forms do
not. See confirmed finding REGRESSION-001-D06 in section 11.

## 7. D03 — Reddit unresolved requirement

**FAIL: technically feasible mechanism, unimplemented adapter.** `playerFor`
returns null for Reddit. Both baseline and independent Chromium runs show no inline
load button and no Reddit frame. Metadata provider/ID, source label and original
links remain; independent browser checks verify correct hrefs and new-tab
`noopener noreferrer`. Link navigation to live synthetic Reddit content was not
attempted; link construction works, provider availability is **NOT TESTED**.

Reddit's [official embedding guide](https://support.reddithelp.com/hc/en-us/articles/360043033532-How-do-I-embed-a-Reddit-post-or-comment-in-an-article-or-other-publication)
confirms manual embeds and oEmbed. The linked
[official embed documentation](https://publish.reddit.com/assets/Reddit_Embed_Documentation.pdf)
shows oEmbed HTML containing a blockquote and `embed.reddit.com/widgets.js`.
It does not establish a supported standalone player URL or a no-autoplay guarantee.
No untrusted oEmbed HTML/script was executed in the trusted application DOM.

An isolated adapter is **technically plausible, inferred from the official widget
mechanism**, but not implemented or validated. A separate-origin sandboxed document
could construct allowlisted markup/provider script from validated structured IDs,
with click consent, origin/CSP boundaries and reviewed resize messaging. It would
need live tests for attribution, autoplay, deleted/private/restricted posts and
provider terms; isolation and playback success are not proven by this audit.
Provider restrictions can block specific posts, but they do not explain the absence
of any implementation.

Recommendation: approve a separately reviewed isolated adapter, or explicitly defer
Reddit inline support with its visible link-only behavior and acceptance impact.
Working external links alone must not mark D03 fixed.

### Carried defect QA-001-D03

- **Severity:** P2; **classification:** FAIL; deferral REQUIRES PRODUCT DECISION.
- **Files/lines:** `src/lib/presentation.ts:63–64`; frontend news rendering
  `src/lib/render.ts:56–58`; provider metadata `automation/core/metadata.ts:90–96`.
- **Reproduce:** Run the browser-enabled independent fixture. It publishes
  `https://www.reddit.com/r/test/comments/abc123/title/` through the real API and
  inspects the resulting card. Alternatively call `playerFor` with that structured
  Reddit provider embed.
- **Expected:** Eligible supported Reddit content offers safe click-to-load inline
  rendering with attribution and original fallback.
- **Actual:** null player, zero load controls/frames; source/title links only.
- **Evidence:** `independent-browser.log` and the 13-assertion fix scenario in
  `backend-browser.log`; official mechanism references above.
- **Recommended fix:** Reviewed isolated adapter, or explicit approved scope deferral.

## 8. D04 — Private state

**PASS within the documented trusted-parent model.** Newly created directory 0700,
files 0600, preexisting owned 0700 accepted. Existing 0755 fails closed on reads,
writes, removal, listing and locks; permissions remain unchanged. User-created
path/ancestor and file symlinks reject. Unsafe file mode and filename traversal
reject. A simulated mismatched caller UID rejects ownership; real foreign-owner
chown was not attempted by the non-root account.

Independent replacement test wrote/read 20 versions through new State instances,
verified 0600, changed inode and no leftover temporary files. Recovery JSON remains
readable. An unrelated directory was rejected without automatic chmod. Implementation
uses exclusive no-follow temporary opens and rename. This proves atomic replacement
in these tests, not fsync-backed persistence through power loss. Trusted parent
ownership and same-user replacement limitations remain documented.

## 9. D05 — Retry durability

**PASS.** Fresh retry tests exercised 408, 429, 500, 502, 503, 504 and network
failure, three immediate attempts, Retry-After seconds/date and deferred long waits.
Permanent 400/401 stops immediately and removes automatic recovery payloads.
Telegram checks the actual state file before claiming saved recovery; permanent
failure and missing originals correctly say no payload was saved.

Independent real-D1 challenges POST the valid payload first, then replace the
successful response with each temporary status or a thrown network failure. After
three uncertain attempts the database has one publication and exact payload remains
with status/attempt metadata. A **new Publisher/State instance**, representing a
later run, replays successfully as a duplicate; D1/feed still has one row and the
outgoing record is removed. This includes both **502 and 504 after commit**.
Evidence: `retry-commit.json`, `independent-browser-enabled.log`; the baseline
uncertain-502 integration was also rerun.

Ten submission cycles and per-run replay bounds remain enforced by the rerun
existing tests. Exhausted records require manual review; permanent failures require
corrected input/authentication. Stale locks after abrupt termination remain an
operational recovery limitation.

## 10. Security verification

### SEC-001 — Preview URLs

**PASS at URL and render boundaries.** Public HTTPS image accepted; HTTP,
localhost/local names, private/reserved IPv4/IPv6, mapped IPv6, shortened/decimal/
hexadecimal numeric IPs, credentials, unexpected ports and unsafe schemes rejected.
Malformed or broken images retain readable fallback cards and original links.

The real API stored a legacy-style private preview URL; Chromium rendered that
persisted record without an image or private request. This matters because the API's
wire validator still accepts HTTP(S) metadata generally: safety is checked again
when rendering existing D1 records, not assumed from ingestion.

**REQUIRES PRODUCT DECISION:** A public-looking hostname can resolve privately or
redirect to a private destination. Direct browser images are not fetched/pinned by
automation; `img-src https:` permits HTTPS hosts broadly. No DNS/rebinding/redirect
protection for those browser requests is demonstrated. Review an approved curated
origin policy, suppressing previews or another architecture before accepting this
residual risk. No private-service exploit was attempted.

### SEC-002 — CSP and headers

**PASS locally.** Real responses verified on HTML, CSS, JavaScript, SVG, missing
assets, public feed, unknown API route and authentication/validation errors. Static
`_headers` values match Worker explicit security headers: CSP, nosniff,
no-referrer, Permissions-Policy, DENY/frame-ancestors and HSTS.

CSP denies by default; scripts/styles/API connections same-origin, no inline script,
eval, objects, base URL or forms; frames restricted to YouTube NoCookie, TikTok and
Instagram. Browser tests prove inline/third-party script blocks and arbitrary frame
origin blocks. All three supported providers navigate to mocked fixtures only after
clicks, with disabled autoplay and source escape links. Publication HTML remains
inert text. Reddit script is not permitted or injected.

**NOT TESTED:** production TLS/HSTS enforcement, Cloudflare edge/platform-generated
errors, remote header/cache behavior or a deployed site's resistance to framing.
Local header assertions establish frame restriction configuration; the browser test
establishes host frame-src enforcement, not a cross-site attacker framing experiment.

### SEC-003 — DNS deadlines and SSRF

**PASS.** Original remediation test aborts a pending lookup with zero sockets.
Independent test resolves DNS _after_ abort and confirms zero sockets even after
completion. A redirect chain uses one overall signal: first lookup/connection occurs,
second lookup exceeds deadline and no second connection opens. Recorded latest
late-lookup observation **58 ms**, redirect observation **63 ms** (includes a
30 ms post-abort observation period), one redirect socket. Tests use short fixture
deadlines, not a production resolver stall.

Literal/local checks, all-answer checks, mixed-DNS rejection and per-hop pinning
remain functional. OS DNS work can continue after callers stop waiting. Standalone
request timeout is 15 s; retry wrapper supplies 35 s per attempt. Up to three
attempts/backoff means an entire preparation cycle can exceed a single-attempt
bound; this is not an unlimited redirect deadline.

## 11. Newly confirmed defect — REGRESSION-001-D06

**TikTok cross-URL deduplication fails. Severity: P2. Classification: FAIL;
identity-policy remediation REQUIRES PRODUCT DECISION.**

- **Affected files/lines:** `automation/core/metadata.ts:114–121,156–164`
  preserves submitted canonical/source and null source ID while only updating embed
  identity; `worker/store.ts:67,84–111` deduplicates canonical URL or exact
  `(source, source_item_id)` only; `docs/api.md:248–256` explicitly excludes inferred
  provider equivalence. These locations explain the behavior, not an authorization
  to edit the approved contract.
- **Exact reproduction:** Install/build baseline, then run
  `node --test tests/regression-001.mjs`. Fixture creates isolated migrated D1 and
  temporary-token Worker on a free port; mock DNS as public/pinned and HTTPS 302
  redirects from `https://vt.tiktok.com/regression001/` and
  `https://vm.tiktok.com/regression001/` to
  `https://www.tiktok.com/@regression/video/6718335390845095173`, with final 200 HTML.
  Submit these three URLs sequentially using allowed private Telegram fixture user
  123 via real `handleUpdate` → `prepareUrl/publicHttp` → `Publisher/Api` → local
  authenticated POST. Inspect GET feed and D1 query results.
- **Expected:** One video produces one underlying publication; subsequent link forms
  return duplicate success.
- **Actual:** All three replies say PUBLISHED; three different UUIDs/rows and three
  feed entries. Every embed has the same TikTok provider/ID/canonical embed URL.
  `canonical_url` stays distinct per submitted form; `source` is vt/vm/www hostname,
  and `source_item_id` is null.
- **Evidence:** `output/regression-001/cross-url.json` contains submitted URLs,
  mocked hop sequence, replies, exact D1 rows and `feedCount: 3`; both independent
  runs fail the one-entry assertion (`3 !== 1`). This is one child failure plus its
  parent runner failure, **not two defects**.
- **Recommended fix:** Seek owner approval for a stable provider identity policy
  across automation/backend/frontend, preserving original submitted URLs. Consider
  consistent provider namespace plus source item ID or an approved canonical identity
  rule. Merely assigning an ID while keeping different source namespaces is
  insufficient. Coordinate contract/docs/consumers, atomic uniqueness, tombstone
  and conflict behavior, existing-row collision review and cross-form/concurrent
  acceptance coverage before implementation.

This is a confirmed unmet **new requested acceptance expectation**, not proof that
FIX-001 regressed an earlier supported contract. The current backend implements its
published duplicate contract correctly. This audit did not silently change it or
accept the observed behavior.

No other new confirmed application regression was observed in exercised scope.

## 12. General regression and remaining limits

**Backend PASS:** creation/feed/item reads, authorization/fail-closed units,
strict input and metadata envelopes, cursor ordering/ties/insertions/deleted cursor
rows, atomic concurrent duplicates, tracking variants, namespace conflicts,
idempotent soft deletion/tombstones and URL-less changelogs. D1 integration runs use
actual SQL constraints, migration/index checks and error responses.

**Frontend PASS:** one chronological feed, loading/empty/error/retry states,
infinite scroll and duplicate suppression, direct older/deleted permalinks, all four
card kinds, original links, inert HTML, unavailable previews, click-only players and
no-autoplay configuration. Widths 320/390/768/1440 have no observed horizontal
overflow. Visual inspection of desktop/mobile screenshots confirms Doom Monitor,
red accents, thin card separators and the responsive layout. Desktop cards have
internal media/text columns but remain one chronological feed. No categories,
comments, reactions, accounts or share functionality appeared in inspected UI/code.

**Automation PASS with mocks:** valid RSS/Atom/HN/USGS parsing, source failure
isolation, zero selections/zero publications, five-selection daily cap and 3–5 as a
target rather than forced quota, manual Telegram publication/deletion without AI
filtering, polling checkpoint fixtures, monthly generation from visible existing
published materials only, exact citation validation, empty month and duplicate
monthly skip, retry draft invalidation on deleted references. The rerun monthly
suite passes **156 input publications across API pages**, with no 100-item input
truncation; output references remain limited to 100 by contract. Real API integration
also reruns automation publication and monthly idempotency behavior.

**NOT TESTED external limits:** live provider playback/consent/geographic/content
eligibility, live Reddit link availability, real Telegram polling or installed
OpenClaw lifecycle/scheduling, model factual/translation/editorial quality and actual
large-context capacity. No mocked player is counted as live provider verification.
Safari/Firefox, physical mobile devices, assistive technologies, production load,
remote D1/Free limits and long-duration polling remain untested.

**ACCEPTED LIMITATION in current contract:** keyset pagination is not a snapshot;
concurrent deletions can change later pages. Monthly citation visibility is checked
before POST, not atomically with concurrent deletion; the specific deletion race was
not reproduced here. Representative regex feed parsing is not a full XML parser.
These are carried documented limits, not newly observed failures. Acceptance of
external preview DNS/redirect risk remains an explicit product decision above.

Evidence is local under ignored `output/regression-001/`; screenshots under
`output/playwright/` include `desktop.png`, `mobile.png`, `integrated-mvp.png` and
`regression-policy.png`. `output/regression-001-evidence.zip` preserves logs,
JSON evidence, fixtures and screenshots with a SHA-256 manifest. Neither archive
nor temporary secrets/state are committed; preserve the archive with the report for
transfer to another machine.

## 13. Production readiness and recommended next action

**FAIL / NO-GO against REGRESSION-001 acceptance.** Four implemented fixes and
local security hardening pass; the expanded TikTok deduplication requirement fails
and Reddit remains incomplete. Green baseline suites do not erase these findings.

1. Make an explicit coordinated identity-policy decision for REGRESSION-001-D06;
   remediate it and rerun the retained failing real-D1 acceptance fixture.
2. Implement a reviewed isolated Reddit adapter or record explicit product approval
   to defer D03. Assess external-preview DNS/redirect exposure explicitly.
3. After these decisions/remediations, reassess local acceptance. Separately authorize
   intended-host/provider verification and future deployment/edge checks; this audit
   is not production Cloudflare verification or authorization to deploy.

If the identity requirement is approved and satisfied and D03 is explicitly deferred,
readiness can become **conditional on that documented product decision and remaining
external verification**. At this revision no such approval is assumed.
