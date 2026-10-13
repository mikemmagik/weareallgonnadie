# FINAL-QA-002 — Integrated Release Candidate Acceptance

**LOCAL RELEASE CANDIDATE: PASS; suitable for genuinely access-restricted
Cloudflare staging, subject to the staging conditions below.**

**PUBLIC PRODUCTION: NO-GO.** Operator configuration, live-provider verification,
the carried preview-risk decision and deployed-environment acceptance remain open.

## 1. Audited revision and scope

Independent review performed **13 October 2026, Asia/Bangkok**, in
`/Users/mikemmagik/Documents/waagd-final-qa`, branch `qa/final-rc`.
The clean starting HEAD and `integration/release-candidate` both resolved to the
requested baseline **`f7e1336de0c7c859f7434037750ff1788aea1624`**.
This report's delivery commit is separate; obtain it with `git rev-parse HEAD`.

Read `AGENTS.md`, INT-002, FIX-003 and LEGAL-001 handoffs, the previous release
report, API contract and deployment guide. Reviewed actual storage/input/auth/routing,
migration, media/preview policies, consent renderer, legal pages/styles and relevant
automation and committed tests. Previous reports supplied historical context; fresh
results below determine this acceptance. Documentation's future deployment/setup
instructions did not authorize those operations.

The focus was combined acceptance and previous blockers. Existing suites provided
representative regression coverage; no new application functionality was introduced.
Only this report is committed. Application code, existing tests, contracts,
migrations, lockfile and configuration remain unchanged. In particular, the retained
`tests/release-qa.mjs` and `tests/regression-001.mjs`, plus main security-header files,
are byte-identical to their prior QA baseline `f14de95008ab918464b764118fe0af42d8b9c051`.
Local SHA-256 evidence is `output/final-qa-002/integrity.json`.

## 2. Environment and isolation

macOS arm64, Node **v24.15.0**, npm **11.12.1**, locked Astro **7.3.8** and
Wrangler **4.149.0**. Browser checks used task-owned headless cached Chromium via
Playwright CLI session **`finalqa002`**, with the Chrome channel unset. No browser
installation was required. Astro served `http://127.0.0.1:64842`; integrated fixtures
allocated loopback ports dynamically, including **50693** for live Reddit recording.

Worker checks used real local workerd HTTP and fresh temporary D1 with the actual
migration, sentinel database IDs, `remote: false`, `remoteBindings: false`, explicit
`--local` migrations, disabled environment-file loading and test-only write tokens.
Fixture cleanup stops Workers/proxies and removes temporary runtime/database state.
No production credentials or resources were used.

The ignored `output/final-qa-002/run.py` command recorder removes inherited
`CLOUDFLARE_*`/`CF_*` variables, disables Astro telemetry and Wrangler metrics,
disables dotenv loading and isolates XDG preferences/cache and Wrangler logs under
ignored `.wrangler/final-qa-002/`. Each invocation records expanded arguments,
exit status, duration and full output. The existing smoke fixture additionally
isolates its own tool paths.

Telegram, AI, metadata/DNS/socket challenges and deterministic provider responses
are mocks. They are distinguished from the separate anonymous, unmocked live Reddit
attempt. No real bot, model or OpenClaw installation was exercised.

## 3. Actual commands and results

All commands ran in this checkout. The exact recorder prefix for each row was
`python3 output/final-qa-002/run.py <log-stem>`; environment assignments are shown
where relevant. Automation's wildcard expanded to both committed test files.
Counts overlap, include test-runner parents where stated, and must not be summed.

| Command after recorder prefix                                                                                                                             | Log stem              | Exit / actual result                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`                                                                                                                                                  | `npm-ci`              | 0; 395 packages installed, 396 audited, zero reported vulnerabilities                                                                |
| `npm run build`                                                                                                                                           | `build`               | 0; four static pages and Worker dry-run bundle, no deployment                                                                        |
| `node --test tests/release-qa.mjs`                                                                                                                        | `release-qa`          | 0; 5 runner entries, all four legacy scenarios pass                                                                                  |
| `node --test tests/regression-001.mjs`                                                                                                                    | `regression`          | 0; 6 runner entries, retained one-feed-entry assertion passes                                                                        |
| `node --test automation/tests/*.test.ts`                                                                                                                  | `automation`          | 0; 56 tests pass                                                                                                                     |
| `node --test tests/backend.integration.test.ts`                                                                                                           | `backend`             | 0; 41 runner entries, including 24 active/deleted legacy cases                                                                       |
| `npm run validate`                                                                                                                                        | `validate`            | 0; Astro 0 errors/warnings/hints, strict TypeScript, lint and formatting pass; 86 unit tests, 1 build smoke, 41 backend entries pass |
| `/Users/mikemmagik/.codex/skills/playwright/scripts/playwright_cli.sh -s=finalqa002 open about:blank --config output/playwright/final-qa-002.config.json` | `browser-open`        | 0; isolated browser opens                                                                                                            |
| `npm run dev -- --host 127.0.0.1 --port 64842`                                                                                                            | `astro-dev`           | 0; detached development server starts, PID 93049                                                                                     |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=finalqa002 node --test tests/backend.integration.test.ts`                                                    | `backend-browser`     | 0; 42 runner entries; 37 integrated frontend, 28 deterministic Reddit, 65 legal/privacy assertions pass                              |
| `WAAGD_BROWSER_SESSION=finalqa002 WAAGD_FRONTEND_BASE=http://127.0.0.1:64842 npm run test:browser`                                                        | `frontend-browser`    | 0; 35 frontend assertions pass against Astro                                                                                         |
| `WAAGD_BROWSER_SESSION=finalqa002 node tests/legal.browser.mjs http://127.0.0.1:64842`                                                                    | `legal-browser-dev`   | 0; 65 legal/privacy assertions pass against Astro                                                                                    |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=finalqa002 node --test tests/regression-001.mjs`                                                             | `regression-browser`  | 0; 7 runner entries and 19 independent provider/CSP assertions pass                                                                  |
| `WAAGD_LIVE_REDDIT=1 WAAGD_BROWSER_SESSION=finalqa002 node --test tests/release-qa.mjs`                                                                   | `release-qa-live`     | 0; 6 runner entries; live-outcome recording completes, actual Reddit rendering NOT VERIFIED                                          |
| `node output/final-qa-002/accessibility.mjs`                                                                                                              | `accessibility-final` | 0; 24 supplementary legal-page keyboard/landmark/no-JavaScript checks pass                                                           |

The environment assignments above were passed to the recorder, before its prefix.
`output/final-qa-002/core.py` and `browser.py` orchestrated the same commands
sequentially; they did not change tests. Build ran explicitly and again unchanged
inside validation's smoke test. `npm run validate` does not run independent release
acceptance; its green result is supplemented by the explicit release/regression runs.
The package audit result is not comprehensive dependency assurance.

The supplementary accessibility probe initially exited 1 because its global `h1`
locator included four headings inside Astro's development-toolbar shadow DOM.
The diagnostic recorded the five headings and the single `main h1`. The final probe
scopes the structural assertion to the application's main landmark; all 24 checks
then pass. Initial output and diagnosis remain in `accessibility.log`,
`accessibility-investigate.log` and `accessibility-dom.log`. No committed test was
altered or removed; this was an audit-probe targeting error, not an application defect.

## 4. D06 and D07 acceptance

**D06: PASS locally.** Retained regression exercises vt, vm and canonical TikTok
URLs through mocked safe redirect preparation and actual authenticated Worker/D1
publication. They yield one feed entry and one row. Backend acceptance also verifies
forward/reverse order, tracking variants, original URL preservation, normalized
TikTok namespace/ID, separate other-provider identities and unresolved-link fallback.
The 18-request concurrent race yields exactly one creation, 17 successful duplicates
and one row. Deleted identities return duplicate tombstones, remain hidden from
public reads and are never resurrected. D1 constraints and insertion/lookup batch
preserve atomic duplicate handling.

**D07: PASS; previous blocker closed for this revision.** Inspected the independent
fixture's response JSON, row counts and complete before/after rows:

| Seeded legacy record                           | Actual response             | Storage           |
| ---------------------------------------------- | --------------------------- | ----------------- |
| Canonical original A, optional metadata absent | `200`, successful duplicate | One unchanged row |
| Canonical original A, TikTok embed ID/URL B    | `400 VALIDATION_ERROR`      | One unchanged row |
| Canonical original A, TikTok source item ID B  | `400 VALIDATION_ERROR`      | One unchanged row |
| Canonical original A, embed ID A, embed URL B  | `400 VALIDATION_ERROR`      | One unchanged row |

The wider FIX-003 matrix exercises 12 scenarios in both active and deleted states,
with six concurrent canonical/vt/vm submissions each: **24 cases, 144 requests**.
Consistent original/embed identities, other namespaces and fallback-link metadata
produce successful duplicate responses. Original/embed/source contradictions and
source-only unresolved identities fail closed with the exact sanitized message
`Existing TikTok identity requires data review.` All confirmed D07 contradictions
return the required code/status; every complete stored row, original and deletion
state remains unchanged, row count stays one, and tombstones stay publicly invisible.

Code review confirms each recognized original/source/embed-ID/embed-URL claim is
checked before duplicate success. Optional absence makes no claim; source-only
metadata cannot verify an unresolved original. Historical contradictions still need
operator review; this fix does not repair/backfill them. Worker ingestion validates
authenticated resolved metadata structurally and does not independently attest live
short-link redirects. Automation retains the safe resolution boundary.

## 5. Disclaimer, legal/privacy and accessibility

**PASS for local implementation.** Exact rendered heading/body on the homepage and
legal page:

> DISCLAIMER — NOT A NEWS OUTLET
>
> This is not a news outlet. This website is a satirical collection of third-party content, memes, and commentary. Refer to original sources for factual information.

The disclaimer persists after the masthead and before the feed, has no dismissal or
animation, and uses neutral readable styling. `/legal` and `/privacy` serve as
static pages with existing security headers. All three relevant page footers expose
LEGAL, PRIVACY and CONTACT. Responsive checks pass at **320/390/768/1440 px**.
Reviewed desktop/mobile legal/privacy/home/feed screenshots confirm readable
information and links. Astro screenshots include its development toolbar;
production integrated-feed/Reddit screenshots do not.

Supplementary checks confirm declared language, one application page heading/main
landmark, named legal navigation, resolving section labels, first-Tab visible skip
links, keyboard skip activation and Tab access to all footer destinations. Legal
information, footer and honest contact notice remain available with JavaScript
disabled. This is exercised accessibility coverage, not a complete assistive-technology
certification.

No operator identity/entity/state or contact email has been fabricated. The actual
operator object remains `identity: null`, `contactEmail: null`,
`contactVerified: false`. Missing/unverified/malformed contacts create no mailto;
CONTACT honestly links to `/legal#contact`. The synthetic verified-contact unit case
does not verify any real mailbox. The United States is the user-selected operator
jurisdiction; entity type and state remain unknown. Their absence is a **public-launch
configuration blocker**, not a frontend implementation defect or staging blocker
under the access restrictions below. No legal compliance conclusion is made.

## 6. Media consent and security regression

**Media consent: PASS locally, desktop and mobile.** No external image, embed,
provider script or Reddit adapter request occurs before the tested item's explicit
LOAD CONTENT action. First-party assets may load normally. Notices identify the
validated provider or image hostname; original links remain accessible before and
after loading. Permission is per item, resets on reload and is not stored.
Unsafe previews stay suppressed; missing and broken media retain readable fallback
and source links. Embeds do not fetch separate preview images. Player URLs and
permissions deny autoplay; deterministic Reddit effective autoplay permission is false.
Real provider playback/no-autoplay remains separately unverified where content cannot load.

**Security regression: PASS for exercised local protections.** Ordinary Worker and
static CSP/headers remain unchanged and aligned: scripts/styles/API connections
stay same-origin, provider frames stay allowlisted, inline/unapproved scripts and
arbitrary frames are blocked. API successes/errors, HTML/CSS/JS/SVG, missing assets
and new information routes retain security headers. Ordinary documents deny framing.

Only the Reddit adapter has the scoped nonce/fixed official widget script and style
exception. Both iframe sandbox and adapter CSP omit `allow-same-origin`; browser
checks demonstrate provider code cannot access the parent DOM, trusted DOM remains
unchanged, no widget script runs in the host, and arbitrary adapter frames/scripts
are blocked. Deterministic deleted/private/restricted outcomes retain original links.
Reddit short-link resolution uses the fixed official HTTPS oEmbed endpoint, no
redirects, a deadline/body bound and same-ID URL extraction while discarding markup.

Authentication still precedes submission parsing/database access and fails closed
without its secret. Parameterized SQL/constraints, sanitized errors, text-only HTML
rendering, unsafe preview suppression and automation DNS/address-pinning/redirect/
deadline defenses pass. No auth bypass, arbitrary script execution or security
policy weakening was confirmed in the exercised paths.

## 7. Representative general regression

| Area                           | Verdict and fresh evidence                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API/auth/migrations            | PASS; create/read/list/delete, authorization failures and missing secret, migrations applied twice, schema/uniqueness/immutable triggers and indexed ordering                       |
| Pagination/permalinks/deletion | PASS; timestamp ties, concurrent insertion, deleted cursor row, older/deleted permalinks, idempotent soft deletion and invisible tombstones                                         |
| Frontend                       | PASS; news/video/meme/changelog, inert external text, original links, empty/error/retry states, pagination without duplicates and responsive layout                                 |
| Daily discovery                | PASS with mocks; zero selections allowed, broken-source isolation, selection validation and persisted cap across reruns; actual Worker/D1 integration exercised                     |
| Manual Telegram                | PASS with mocks; approved manual path has no editorial AI call, preserves `origin: telegram`, authenticates, handles duplicate/delete and denies unauthorized/group/bot updates     |
| Retry durability               | PASS; 408/429/500/502/503/504/transport failures, Retry-After/bounds, real committed D1 write followed by lost response and fresh Publisher replay yields one row and clears outbox |
| Monthly changelog              | PASS with mocks; visible inputs/citations, calendar boundaries, empty month/deleted reference handling, real Worker/D1 monthly creation and fresh-state idempotent rerun            |
| More than 100 monthly inputs   | PASS with mocked API/AI; two pages supply **156 in-month visible publications**, exclude next-month boundary and pass the exact count assertion; not a live-model capacity test     |

## 8. Fresh external-provider outcome

**Live Reddit content/media: NOT VERIFIED — external provider restriction.**
The unchanged live recorder used public image post `crpjwk` and text AMA `z1c9z`
through actual local publications. No credentials, request interception, provider
restriction bypass or network configuration change was used for this attempt.

| Observation                                | Image/meme `crpjwk`                                          | Text/news `z1c9z`                 |
| ------------------------------------------ | ------------------------------------------------------------ | --------------------------------- |
| Pre-consent Reddit/adapter requests        | 0                                                            | 0                                 |
| Local adapter HTTP                         | 200                                                          | 200                               |
| Official widget script HTTP                | 200                                                          | 200                               |
| Official content frame HTTP                | **403**                                                      | **403**                           |
| Provider text                              | “You've been blocked by network security.”                   | Same                              |
| Actual content/media visible               | No                                                           | No                                |
| Recorded request failures / CSP violations | None                                                         | None                              |
| Live media/no-autoplay                     | NOT VERIFIED; no playable content                            | NOT VERIFIED; no playable content |
| Original navigation                        | Opens provider destination; HTTP 200 security/challenge page | Same                              |

The recorder's exit 0 confirms completed observation, not successful content rendering.
Local adapter functionality/isolation is accepted separately. No new adapter/CSP
defect is established by these 403 responses. Full observations are preserved in
`output/release-qa/reddit-live.txt`, extracted
`output/final-qa-002/reddit-live.json` and live screenshots under `output/playwright/`.

## 9. New defects and remaining limitations

**New confirmed application defects: none in the exercised scope.** D07 is no
longer an outstanding local defect. The supplementary probe's development-toolbar
heading mismatch was diagnosed and corrected without changing application/tests.

Remaining limits:

- Direct external images are user-initiated, but post-consent DNS/redirect destinations
  cannot be pinned under the current browser/no-proxy model. `img-src https:` remains
  broad. Consent reduces unsolicited requests; it does not resolve this carried
  limitation. An explicit owner decision remains required. No exploitation result
  or private-service access was attempted or inferred.
- Legitimate live Reddit content/media/playback verification is still missing. Other
  providers' real playback/eligibility also remains unverified; deterministic fixtures
  prove local consent/construction/isolation only. Obtain legitimate evidence or an
  explicit owner decision on launch scope; no exception is assumed here.
- Historical TikTok contradictions/multiple matches require explicit review before
  import; legacy scan cost needs production-volume assessment. No backfill is implied.
- Deployed Cloudflare access controls, edge/TLS/HSTS/cache/platform-generated errors,
  remote D1/migrations and actual logging/cookies are unverified. Local tests do not
  establish edge behavior or genuinely restricted staging access.
- Real Telegram delivery/polling ownership, intended-host OpenClaw lifecycle/schedules,
  model quality/capacity, Safari/Firefox/physical devices, full assistive technology,
  production load/Free-limit behavior and long-duration operation remain unverified.
- Existing documented boundaries remain: non-snapshot keyset pagination, monthly
  reference checks not atomic with concurrent deletion, representative regex feed
  parsing, no power-loss/fsync guarantee for state replacement and operator stale-lock
  recovery. No new failure was observed in these boundaries.

## 10. Required operator configuration before public launch

The selected jurisdiction is **United States**. Do not infer an operator name,
corporation/individual status, state or mailbox from that selection.

Supply the real responsible public operator identity, establish actual entity type
and state, and obtain review of applicable disclosure/legal/privacy/content-rights
requirements against those facts. Configure a real monitored mailbox for removal,
copyright and privacy requests; verify delivery and operator access before setting
`contactVerified: true`, then rebuild and verify the public links. The existing
operator object only contains identity/mailbox/verification fields; it does not
implicitly configure the unknown entity/state or determine disclosure obligations.

Review actual deployment logs/security cookies, email processing and complaint
retention; complete the notice and removal-handling process with reviewed facts.
Missing real operator information remains a **public-launch configuration blocker**.
Do not publish example addresses or placeholder identity as facts.

## 11. Separate release recommendations

### A. LOCAL RELEASE CANDIDATE

**GO for deployment to access-restricted Cloudflare staging as a candidate.**
The requested revision passes local integrated D06/D07, legal/privacy, consent,
security, representative automation/backend/browser regression and build acceptance.
There is no confirmed local application defect requiring another code fix.

This recommendation requires genuinely enforced access restriction across the
staging hostname, assets, information pages, API and adapter, with no alternate
public deployment URL or unapproved public content exposure. Use approved test
content/data and separately reviewed local-to-staging bindings/secrets. Verify
unauthorized access denial and authenticated staging behavior after an explicitly
authorized deployment. The current repository configuration is local preparation;
it does not establish those access controls. Missing operator identity/mailbox and
the provider's external 403 do not alone block this restricted staging exercise.

This audit did not deploy and does not authorize infrastructure/DNS/main changes.
Staging deployment acceptance remains to be verified on the deployed environment.

### B. PUBLIC PRODUCTION

**NO-GO; public-launch readiness is not claimed.** Before public launch:

1. Complete and verify real US operator identity, actual entity type/state, monitored
   contact mailbox and reviewed legal/privacy/rights/removal/retention information.
2. Resolve legitimate live Reddit/media acceptance or obtain an explicit owner
   decision on launch scope, and verify other intended providers' real behavior.
3. Record the explicit owner decision on post-consent image DNS/redirect exposure;
   review historical identities before importing data.
4. Under separate authorization, complete restricted-staging/deployed edge, remote
   D1/migration/auth/CRUD/header/access-control and rollback checks, then intended-host
   automation and appropriate provider/browser/device verification.

## 12. Evidence and delivery

Command logs/argument records and supplemental probe are under ignored
`output/final-qa-002/`. Independent identity/retry/DNS evidence is under
`output/release-qa/` and `output/regression-001/`; browser results/screenshots are
under `output/playwright/`. Reviewed screenshots are copied under
`output/final-qa-002/reviewed-screenshots/`; legal/home/privacy copies are Astro
development views, while integrated-MVP/Reddit copies are built Worker assets.
Preserve these local artifacts alongside the committed report when transferring
evidence. A local evidence archive and SHA-256 manifest are provided in `output/`.

Final report formatting and whitespace checks pass. The task-owned browser is
closed and Astro PID 93049 is stopped after verifying it belongs to this checkout
and port; temporary Worker/D1 fixtures cleaned up. Cleanup command records are
`browser-close` and `astro-stop`. Only `docs/final-qa-002-report.md` is committed on
`qa/final-rc`; no push, main merge, deployment, DNS/resource creation, real bot
registration or OpenClaw change occurred. `main` and `origin/main` remain
`ee1f03512cf921c64e3a700a7d3ef1803cba62dc`.
