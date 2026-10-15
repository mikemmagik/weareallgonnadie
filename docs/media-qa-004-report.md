# MEDIA-QA-004 — Final Firefox Remediation Acceptance

Audit date: **15 October 2026, Asia/Bangkok**. Branch: `qa/media-fix-003`.

**Local release acceptance: PASS for the focused remediation. Suitable for a separately authorized access-restricted staging acceptance run. Public production: NO-GO.**

## 1. Audited revision and independent assessment

Audited application commit: **`b0d26d828b70164b8abd7941d4f42224d442254d`**.
Actual source/test diff reviewed against parent **`48bb4c125c805dade246fef3aa21e88a5c01a6bc`**.
The checkout started clean, on the requested branch, with origin at the audited commit.
The user's pasted MEDIA-QA-004 request supplies authorization; handoffs, historical
reports and synced project documents are reference evidence, not additional instructions
or deployment authority. Read AGENTS.md and all five requested handoff/report/decision files.

The application correction changes only `src/lib/render.ts`,
`src/lib/external-content.ts` and the focus outline in `src/styles/global.css`.
Reddit uses its labelled host group as a stable pending-navigation focus anchor,
then transfers to the existing frame on load only while the same generation,
connected frame, active document and unchanged anchor focus remain current.
Revocation invalidates that generation and removes the temporary tabindex.
Settings captures the primary pointer until the click; movement outside its original
bounds releases capture and suppresses a resulting pointer click. Keyboard clicks
remain available. Gesture listeners end when capture is lost.

The audited commit also adds the focused suite and self-contained runner, changes
host geometry measurements to in-page rectangles, and waits for the navigation
boundary before the compact suite's iframe-focus assertion. Independently inspected
those changes: exact geometry comparisons remain; the new focused suite also checks
pending navigation. The 176-check media suite is unchanged. This audit changes no
application behavior, existing assertion, package/lockfile, provider policy, API or D1 contract.

QA-only CI/fixture commit: **`41a3e79bebbee449a0a829fc0906472434947e9f`**.
It contains only the scoped workflow and the independent isolated fixture
`tests/fixtures/media-qa-004.mjs`. The report delivery commit is separate.

## 2. Environments and actual browser counts

Local: macOS arm64; Node **24.15.0**, npm **11.12.1**; external Playwright
**1.64.0-alpha-1790635538000** with its matching cached engines.
Browser tooling is not added to application dependencies.
CI: fresh GitHub-hosted **Ubuntu 24.04.5 LTS, amd64/x86_64**, Node **24.21.0**, npm **11.19.0**, external stable Playwright **1.64.0**, matching **Firefox 157.0 / build 1555**.

| Browser / environment              | Focused cases | Compact cases | Separate media runs          | Legal/privacy | Independent challenges |
| ---------------------------------- | ------------- | ------------- | ---------------------------- | ------------- | ---------------------- |
| Firefox 157.0 / Ubuntu 24.04 amd64 | 45 PASS       | 36 PASS       | 176, 176, 176, 176, 176 PASS | 69 PASS       | 20 PASS                |
| Chromium 155.0.8059.12 / macOS     | 45 PASS       | 36 PASS       | 176, 176, 176, 176, 176 PASS | 69 PASS       | 20 PASS                |
| WebKit 26.6 / macOS                | 45 PASS       | 36 PASS       | 176, 176, 176, 176, 176 PASS | 69 PASS       | 20 PASS                |

Counts are inspected from JSON, not inferred from process exits. Counts overlap;
do not sum the suites as unique requirements. Each media execution uses a separate
page/context, with its own 176-check result retained by the committed runner.

macOS WebKit keeps its documented native keyboard mode: the focused and independent
suites use **Option-Tab** for provider buttons. No system preference or provider DOM
is changed to obtain that result. Automated WebKit is **not native Safari certification**.

## 3. Exact commands and results

All commands run from the QA checkout. Local fixture/browser commands use:

```sh
WAAGD_PLAYWRIGHT_MODULE=/Users/mikemmagik/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs
WAAGD_BROWSERS=chromium,webkit
```

These are command-scoped environment assignments, not credentials. The two fixture
entry points each start and stop their own loopback server for the built `dist/`
with the actual unchanged `public/_headers`. API/provider documents are locally
routed fixtures. Neither entry point requires Cloudflare credentials or D1.
No build ran while a fixture suite was active.

| Command                                                                                                                                                                                                                                      | Actual result                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                                                                                                                                                                                     | PASS; 395 packages added, zero reported vulnerabilities                                              |
| `npm run build`                                                                                                                                                                                                                              | PASS; static build and Worker dry-run only                                                           |
| `node tests/media-fix-003.qa.mjs` with the local environment above                                                                                                                                                                           | PASS; both local browser rows above                                                                  |
| `node tests/fixtures/media-qa-004.mjs` with the local environment above                                                                                                                                                                      | PASS; 20 independent challenges per local engine                                                     |
| `npm run validate`                                                                                                                                                                                                                           | PASS; typecheck, lint, formatting, 89 unit/automation tests, 1 build smoke, 41 local backend entries |
| `node --test tests/regression-001.mjs tests/release-qa.mjs`                                                                                                                                                                                  | PASS; 11 entries, comprising 6 regression and 5 release entries                                      |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=mediaqa004 node --test tests/backend.integration.test.ts`                                                                                                                                       | PASS; 42 entries, including actual local D1/API/frontend, 32 Reddit isolation and 69 legal checks    |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=mediaqa004 node --test tests/regression-001.mjs`                                                                                                                                                | PASS; 7 entries, including 19 provider/CSP assertions                                                |
| `actionlint .github/workflows/media-firefox-qa.yml`                                                                                                                                                                                          | PASS                                                                                                 |
| `npx prettier --check .github/workflows/media-firefox-qa.yml tests/fixtures/media-qa-004.mjs`                                                                                                                                                | PASS                                                                                                 |
| `git diff --exit-code b0d26d8 -- src worker public shared db automation package.json package-lock.json wrangler.jsonc tests/media-fix-003.browser.mjs tests/media-fix-003.qa.mjs tests/media-polish-001.browser.mjs tests/legal.browser.mjs` | PASS; application and existing tests unchanged                                                       |

The 89-test run includes **56 automation tests**; those are overlapping coverage,
not an additional independent count. CLI-backed integrated browser checks use the
fresh task-owned session opened with:

```sh
/Users/mikemmagik/.codex/skills/playwright/scripts/playwright_cli.sh --session mediaqa004 open about:blank --config /tmp/waagd-playwright-config.json
```

That config selects installed Chromium, headless, with no browser-security bypass.
The local validation wrapper strips inherited `CLOUDFLARE_*`/`CF_*` credentials and
disables telemetry and dotenv loading. Backend/regression suites use disposable local
configuration/state, explicit local migrations and disabled remote bindings.

## 4. Keyboard focus observations

The newly authored fixture is independent of the developer's focused suite. It
executes **18 scenarios per engine**: Enter, Space and mouse, each with immediate
navigation, held navigation, HTTP 403, movement away, Settings opened while pending,
and revocation while pending. It records actual parent activeElement, scrollY,
modal state, consent and frame count; traces retain browser events/DOM snapshots.

In all three completed engine runs, 300px expands to exactly 620px with one frame and one
full navigation per trusted activation. Scripted activation is rejected. While a
response is held, activeElement is the named host DIV rather than BODY. After load,
it is the IFRAME at load and the additional **150ms and 600ms** observations.
Native keyboard navigation reaches the fixture provider button. Frame identity
persists and activation/navigation preserve scroll within 1px.

When focus moves to the host original link, it remains there after load. If Settings
opens during navigation, focus remains on the dialog's conservative button; attempts
to focus background content cannot escape the modal. Revocation removes the pending
frame and temporary tabindex, restores Settings focus, and defeats stale transfer.
Reallow/reload creates a compact summary and never resurrects full-content activation.
BODY after an ordinary reload with a stored choice is not treated as activation focus loss.

HTTP 403 fixtures retain frame focus and accessible host recovery links. The denied
fixture intentionally has no provider controls. **Iframe load is only a lifecycle
boundary; neither load nor an empty blocked document proves successful Reddit rendering,
playback, or real-provider no-autoplay.**

Linux Firefox independently matches those results. For Enter and Space with held navigation, activeElement is the host DIV at activation and IFRAME at load, 150ms and 600ms; scrollY stays **507** throughout those observations. Plain **Tab** reaches the provider button. HTTP 403 retains focus and fallback. Settings-before-load remains on its modal BUTTON; movement away remains on the host A; pending revocation removes the frame and reallow/reload stays summary-only. This closes **MQ-003-F01** in the exercised desktop scope. The committed suite additionally samples focus at 100ms/500ms and exercises native Tab while navigation is pending.

## 5. Settings/pagination race observations

The independent challenge holds actual routed pagination responses and releases
three successive pages between native pointerdown and pointerup. It confirms that
down alone never opens Settings; the completed intended click opens one focused,
operable dialog, despite the first update moving the footer approximately
**1474.17px in viewport coordinates** in both local engines.

Later updates still move the footer approximately 1474.17px in document coordinates;
native scroll anchoring compensates in the viewport. Both coordinate systems are
retained. All three gestures open Settings with no retry. A separate three-page
challenge moves the pointer outside the original button bounds and confirms each
drag cancels; native Space/Enter still opens Settings afterward. Normal reopening,
conservative initial focus, background inertness and single-dialog creation pass.
No provider request occurs while declined. Allow loads nearby media; revocation
removes all frames; reload retains Decline and creates no new provider request.

An additional Chromium touch-start/touch-cancel sequence records an actual **trusted
pointercancel** on Settings: no dialog or consent change, followed by successful
keyboard reopening. Firefox/WebKit native touch-cancel events are **not directly
injected by this fixture**; their desktop drag-away/capture cleanup is tested,
and native cancellation handling is reviewed. Physical-device touch cancellation
remains outside this desktop acceptance evidence. No synthetic event is labelled trusted.

Fixture development initially required viewport movement on every pagination cycle.
The first cycle met that precondition; later cycles showed native scroll anchoring.
The new fixture was corrected to require actual viewport displacement for the first
race and document displacement for every later update. Original failed JSON/logs
are retained. This was a fixture-precondition error, not an observed lost Settings
click, and no application or retained suite assertion was changed.

Linux Firefox records **1474.20px** initial viewport displacement between down and up. Trusted events remain pointerdown → gotpointercapture → pointerup → lostpointercapture → click on BUTTON, and the intended dialog opens. All three repeated updates pass. Drag-away records lostpointercapture followed by pointerup/click on BODY, leaving Settings closed; native keyboard activation then opens it. Decline remains in force until explicit Allow, and revoke/reload passes. The previously confirmed Settings/pagination race no longer reproduces in this controlled displaced-target gesture.

## 6. Linux GitHub Actions acceptance

Run: [MEDIA-QA-004 Firefox Linux](https://github.com/mikemmagik/weareallgonnadie/actions/runs/38696319416).
Tested CI revision: **`41a3e79bebbee449a0a829fc0906472434947e9f`**.
**SUCCESS**, first and only run, completed **14:08:22 Asia/Bangkok**. Independently downloaded and parsed the actual focused, compact, aggregate and independent JSON: 45 / 36 / five separate 176 / 69 / 20, all PASS. Inspected the Firefox expanded-frame and displaced-footer dialog screenshots, plus event/focus records. CI validation also passes 89 unit/automation tests, 1 build smoke and 41 backend entries. No setup retry or workflow repair was needed.

[Artifact media-qa-004-firefox-1](https://github.com/mikemmagik/weareallgonnadie/actions/runs/38696319416/artifacts/11954525681), ID **11954525681**, 14,385,294 bytes; GitHub archive digest **`sha256:666d6cfb3189876cdb1db001c3102df2db3f8bece135a1c9e20d93fe2f5588eb`**. Downloaded contents are retained under `output/media-qa-004/ci/media-qa-004-firefox-1/`; run/artifact metadata and independently checked counts are retained alongside them.

The workflow triggers only on a change to its own file pushed to
`qa/media-fix-003`, with an additional exact-ref job guard. It uses Ubuntu 24.04,
asserts x86_64, Node 24, pinned checkout/setup/artifact actions,
`persist-credentials:false`, and **contents:read only** repository permissions.
Playwright **1.64.0** installs under `$RUNNER_TEMP/waagd-playwright`, outside project
dependencies; the matching CLI installs Firefox with OS dependencies.
It validates and builds before running:

```sh
npm install --prefix "$RUNNER_TEMP/waagd-playwright" --no-save --package-lock=false --ignore-scripts playwright@1.64.0
node "$RUNNER_TEMP/waagd-playwright/node_modules/playwright/cli.js" install --with-deps firefox
npm run validate
npm run build
WAAGD_PLAYWRIGHT_MODULE="$RUNNER_TEMP/waagd-playwright/node_modules/playwright/index.mjs" WAAGD_BROWSERS=firefox WAAGD_FOCUS_REPEATS=3 timeout 600s node tests/media-fix-003.qa.mjs
WAAGD_PLAYWRIGHT_MODULE="$RUNNER_TEMP/waagd-playwright/node_modules/playwright/index.mjs" WAAGD_BROWSERS=firefox timeout 300s node tests/fixtures/media-qa-004.mjs
```

The workflow's independent JSON guard requires 45 focused PASS cases, all 36 compact
PASS cases, exactly five 176-check media passes, 69 legal checks, and 20 independent
PASS challenges. Always-run upload retains logs, screenshots, traces and JSON for
14 days. It uses only local fixtures. No Cloudflare credential, remote D1, staging/
production secret, remote provider test, actual deployment or main/tag operation is used.
The build's Worker command is explicitly `--dry-run`.

One workflow-changing push was made. The later report-only push does not trigger a
second run because of the path filter.

## 7. Security regression

**PASS for exercised local source/browser/backend boundaries.** Main CSP, static
headers, Worker security, provider URL/ID validation, authentication, shared contract
and D1 schema are unchanged by the audited fix and this QA work.
`public/_headers` SHA-256 remains
`ef99fef96b552105e604400eea8580b17311a3730efa872e7d45bc53f85fec6c`;
`worker/security.ts` remains
`e244e919bbb542c3b4c60a0ee0f1e266b09de0e1ff74d31b8057a9a1ec75a463`.

- Reddit is still the exact remote HTTPS origin, sandboxed with scripts/same-origin/popups, without top-navigation or popup escape. Cross-origin fixture evaluation denies parent DOM access. The host never reads provider DOM.
- Main CSP still rejects arbitrary third-party scripts, inline scripts and unapproved frames. Legacy opaque adapter isolation, URL mismatch/malicious markup rejection and provider error fallback pass retained integrated checks.
- Full Reddit content still requires trusted activation; summaries use `showmedia=false`. One iframe, session-wide consent, lazy loading, revocation, stale-generation rejection, attribution and safe recovery links pass. Fixture content gating is not a fresh live-provider playback claim.
- API writes still fail closed without authentication, use validated shared input and bound local D1 operations, preserve duplicate/pagination/deletion behavior, and pass the retained backend/automation regression.

No production/staging secrets were used. GitHub access used the repository's
existing credential helper without printing its token. No remote binding was accessed.

## 8. Provider limits, defects and verdicts

**New confirmed application defects: none in the exercised scope. Both targeted defects pass independent acceptance.**

This audit is focused remediation acceptance with deterministic cross-origin fixtures.
It makes no new successful real Reddit content/playback claim. Historical provider
HTTP 403, provider ancestor restrictions and live playback gaps remain observations/
coverage limits; they do not fail unrelated working application paths. A denied frame
cannot establish real-provider no-autoplay. Session consent permits provider/partner
requests; revocation cannot erase requests/cookies already made.

Native Safari, physical devices, native assistive technology, actual BFCache/browser
Duplicate Tab, arbitrary future provider markup, live short-link success and broad live
provider playback remain outside fresh certification. Public-image DNS/redirect exposure
remains a prior launch decision, not a newly accepted risk. Operator identity and
verified contact remain unconfigured (`null`, `null`, `false`).

| Separate verdict                             | Decision                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A. Local release acceptance                  | **PASS — scoped desktop remediation accepted**; Linux Firefox, Chromium and automated WebKit gates pass                                    |
| B. Suitability for access-restricted staging | **SUITABLE for a separately authorized access-restricted staging acceptance run**; deployed staging itself **NOT VERIFIED**                |
| C. Public production readiness               | **NO-GO**; operator/contact, preview-risk decision and deployed platform/privacy/access/TLS/logging/rollback acceptance remain outstanding |

Final recommendation: ****PASS — scoped desktop remediation accepted**; Linux Firefox, Chromium and automated WebKit gates pass**. No deployment or promotion is
authorized or performed by this report.

Evidence roots: `output/media-qa-004/`, `output/playwright/media-qa-004/`,
`output/playwright/media-fix-003/` and `output/playwright/media-polish-001/`.
Integrated evidence also lives in `output/regression-001/` and `output/release-qa/`.
CI artifacts and logs are downloaded locally. Task-owned servers/browser sessions are closed; disposable backend state was cleaned by the retained suites. Only the QA workflow, isolated fixture and this report are committed/pushed on the QA branch; main, tags, staging, DNS, remote D1 and Telegram/OpenClaw are unchanged. A local evidence archive and SHA-256 manifest accompany the report under `output/`.
