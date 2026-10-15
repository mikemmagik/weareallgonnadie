# MEDIA-QA-003 — Final Media Release Acceptance

**Local release acceptance: FAIL. Access-restricted staging promotion: FAIL recommendation / deployed staging NOT VERIFIED. Public production: FAIL / no-go.** Confirmed Firefox keyboard-focus loss prevents final media acceptance. Chromium and WebKit pass the exercised compact UX scope.

Audit date: **15 October 2026, Asia/Bangkok**. Branch: `qa/media-polish-001`.

## Audited revision and authority

- Audited full application/documentation HEAD: **`82c1faab74918c7fce60c1d375b766294682be57`**.
- Expected `82c1faa` and baseline `fix/reddit-compact` match that revision. The application implementation commit is `2c9328a5e7b6a4ebc36fa0b9982ceac06caa7165`.
- The starting checkout was clean. Reviewed the actual compact change against `f024e9427553b1f361a56430a29c781d693fdb52`, its earlier playback remediation, renderer, consent controller, URL/provider validators, CSS, static/Worker headers, adapter and existing tests.
- The user's pasted MEDIA-QA-003 request supplies authority. Repository AGENTS.md and the five named handoff/decision/deployment documents are reference context. Historical instructions/conclusions are not new deployment authority or fresh browser evidence.
- The requested summary plus deliberate full-content activation is the acceptance model for this task. The historical QA-002 request for a product decision is superseded by this scope; images and full body text intentionally require the view action.

Only this report and the narrowly scoped QA workflow are committed. Application source, existing test assertions, dependencies/lockfile, configuration, contracts and migrations are unchanged. Only the QA branch is pushed. No deployment, staging update, main merge, release tag, DNS, remote D1, production resources, Telegram or OpenClaw change occurred.

## Environment and evidence

Local: macOS arm64, Node **24.15.0**, npm **11.12.1**, Astro **7.3.8**, Wrangler **4.149.0**. Browser tooling is external: Playwright **1.64.0-alpha-1790635538000**, Chromium **155.0.8059.12**, WebKit **26.6**. Playwright is not a declared project dependency and was not added.

The local built Worker serves `http://127.0.0.1:8796`; the task-owned Astro development server serves `http://127.0.0.1:4326`. Both use this checkout. The Worker configuration and state are fresh temporary files; migration is explicitly `--local`, `remote:false`, zero sentinel D1 ID, `workers_dev:false`, `envFiles:[]`, loopback binding, no inherited Cloudflare credentials. Only a disposable test write credential exists in the temporary config; it is not logged. Backend/regression/release suites also allocate and remove their own isolated local D1 state. Existing local D1 was not used.

Local commands are retained through `python3 work/media-qa-003/run.py <log-stem> <command...>`. The runner records the exact expanded command, exit code and duration and strips inherited `CLOUDFLARE_*`/`CF_*` credentials. It disables telemetry and dotenv loading and scopes Wrangler preferences/logs to ignored QA directories. Raw local evidence is under `output/media-qa-003/`, `output/playwright/`, `output/regression-001/` and `output/release-qa/`; scratch tooling is under ignored `work/media-qa-003/`.

## Browser verdicts

| Engine                                                | Verdict                                      | Fresh coverage / limit                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium 155.0.8059.12, macOS                         | **PASS** for deterministic application scope | 176 media checks, 36 compact cases, 69 legal checks, independent six-width mouse test; Reddit live is 403 / NOT VERIFIED                                                                                                                                                                                                                                                |
| WebKit 26.6, macOS                                    | **PASS** for exercised scope                 | Same deterministic coverage; actual four-post summary/activation/no-pre-Play-media and 48 live geometry records; deliberate normal playback and animation verified                                                                                                                                                                                                      |
| Firefox 157.0 / Playwright build 1555, Ubuntu 24.04.5 | **FAIL** application acceptance              | Browser launches and navigates. Five unchanged media executions fail in each complete fixture collection; compact suite fails focus transfer. Independent Enter/Space probes confirm persistent keyboard focus loss. Legal/privacy 69 checks PASS. Focused follow-up below; no green application verdict is inferred from legal coverage or successful browser startup. |

### Native Safari: inherited versus fresh

**Inherited focused smoke only; fresh native Safari acceptance NOT VERIFIED.** QA-002 reports native Safari **27.0.1**, build **22625.1.29.11.28**, on 14 October against application `0ae27452ef418e275fbb4a1e13815597d1b3c55a`: session consent, summaries, deliberately activated normal/animated content, revocation/reload and rendered privacy. That predates the compact CSS/class change. It is not fresh 300/620px acceptance, a six-width certificate or machine-readable native playback/network evidence. This task's fresh WebKit results are automated engine evidence, not native Safari evidence. Physical iOS/Android, native assistive technology, real BFCache restoration and browser UI Duplicate Tab remain NOT VERIFIED.

## Reddit compact-layout acceptance

**PASS in local Chromium and WebKit**, with Firefox qualification above. The unchanged existing compact suite exercises text, image, normal video, GIF-labelled media, long summary and HTTP 403 at all six requested widths: **36 cases per engine**. Every case checks compact/expanded geometry, no provider request before consent, no video/audio in the summary, trusted keyboard activation, scripted-click rejection, focus transfer, page-scroll/card-top preservation, provider footer scrolling, source/recovery URLs, overflow, revoke and reallow reset. A separately authored mouse challenge passes all six widths in both local engines, including iframe focus, scroll preservation and 300px restoration. Its 240px summary fixture leaves 14px inside the 254px frame; no actual-provider sizing claim is inferred from a fixture.

| Viewport | Host width | Collapsed host | Summary frame height | Expanded host | Full frame height |
| -------- | ---------- | -------------- | -------------------- | ------------- | ----------------- |
| 320      | 284        | 300            | 254                  | 620           | 618               |
| 375      | 339        | 300            | 254                  | 620           | 618               |
| 390      | 354        | 300            | 254                  | 620           | 618               |
| 768      | 348        | 300            | 254                  | 620           | 618               |
| 1024     | 444        | 300            | 254                  | 620           | 618               |
| 1440     | 570        | 300            | 254                  | 620           | 618               |

Measurements are CSS pixels from actual host/iframe bounds. The compact host includes the 44px native Play / view button and its borders. Expansion deliberately moves subsequent feed content down by 320px; preserving the activated card top and page scroll does not promise no movement of following content.

A fresh independent **real WebKit** recorder exercises the four public examples: `r/IAmA/z1c9z` text, `r/aww/crpjwk` image, `r/aww/j1bvtv` normal video, `r/formula1/7qn3db` animation. All four return real visible official summary/full-content documents. It measures both states at all six widths: **48 live geometry records**, with correct heights and no horizontal overflow. Trusted Space activation preserves page scroll within 1px. Host attribution and exact recovery URLs remain outside the provider document. Browser tooling verifies parent DOM access is denied; application code never inspects provider DOM.

Representative fresh screenshots were visually inspected: actual 320px text summary/title/attribution/actions, 390px expanded duck image, narrow long-summary control access, and desktop/mobile state captures. The previous 620px reservation for a short summary is gone. Provider documents taller than 254px retain native iframe scrolling; Reddit's own responsive title ellipsis/Read more behavior is retained. Deterministic long documents confirm footer controls remain reachable before and after expansion. A separate fresh WebKit AMA check presses the actual provider Read more control and focuses the comments footer at all six widths; the footer stays within the iframe viewport. Fixed sizing cannot guarantee no blank space for every future provider response.

**ACCEPTED LIMITATION:** after session consent, full images/body text use the same deliberate view action as video. The task explicitly asks to accept that model. Provider native Read more may require an additional action for a long body. No metadata guessing, scraping, provider restyling or automatic activation was introduced.

## Video no-autoplay and actual provider observations

**PASS for exercised visible WebKit summaries and deterministic application gating.** Actual normal/animated/image/text summaries contain **zero video/audio elements** in four samples one second apart per post. Playback properties are inapplicable before activation because no post media exists; this is not a hidden or already-started player. Real official titles, attribution and actions are visible. No pre-activation autoplay was observed.

After trusted host activation, image content decodes and actual AMA body text becomes available. The standard recorder observes the normal 20.8-second video decoded at readyState 4 but paused at 0; it does not claim automatic playback. Animated MP4 has duration 2.466s, paused=false, muted=true and positions **1.042 → 2.051 → 0.572 → 1.624s**, demonstrating deliberate post-activation animation and loop wrap.

A separate fresh WebKit check then uses a trusted click on the real provider video after host activation. The decoded normal video plays with readyState 4, paused=false and positions **0.952 → 1.958 → 2.965s**. No scripted `play()` call or provider-policy bypass is used. This confirms intentional normal playback in that fresh context, without turning the earlier paused recording into a pass.

Chromium's real direct summary and expanded frames return **403** for all four examples. **Live Reddit content and playback NOT VERIFIED in Chromium**. Independent host attribution/recovery links and the deterministic 403 cases pass. A blocked document's empty media list is never counted as live no-autoplay proof. No provider restriction was bypassed.

The live legacy opaque adapter remains **NOT VERIFIED**: Chromium content is restricted; WebKit widget-generated content is rejected by the provider's ancestor policy despite an HTTP 200. Deterministic adapter isolation/content-selection passes independently. Current inline display uses the reviewed direct Reddit origin; the legacy route retains its separate restrictions.

Firefox Linux does **not** reproduce Chromium's 403 restriction in the bounded probe: all four actual Reddit examples return HTTP **200** for both summary and expanded frame requests. At 390px, host measurements are approximately **299.99997 / 619.99997px** (normal browser fractional geometry), and exact host original/recovery URLs remain visible. Fresh screenshots visually confirm the official normal-video summary and the expanded duck image. The probe intentionally makes no playback-state claim; its conservative `LIVE CONTENT NOT VERIFIED` label reflects missing media samples, not a 403 or proof that the image failed to display.

The unchanged full Firefox live recorder stalls while collecting `afterPlay = await samples(page)` for its first post. The bounded retry stops that command after 120s; its log records unsettled top-level await and no completed `live-results.json`. **Firefox live no-autoplay media-element sampling and actual intentional video/GIF playback remain NOT VERIFIED.** HTTP 200 and screenshots are not substituted for advancing playback samples. There was no provider bypass.

## Session-consent regression

**PASS in local Chromium/WebKit**: unchanged media UX suite **176 checks per engine**; legal/privacy suite **69 checks per engine**. Coverage includes zero unsolicited provider resources before consent; sessionStorage allow/decline/reload; Escape decline; modal focus/tab behavior; unknown/new/failed storage; explicit in-memory consent with storage unavailable; one session choice across providers; lazy-load margin; repeated scrolling without duplicate frames; fallback when IntersectionObserver is absent; revocation removing existing resources; stale short-link resolution rejection; reallow starting with compact summary; source links; TikTok/Instagram dimensions and reachable controls at six widths; main CSP probes. Firefox results are separate above.

Rendered privacy accurately describes direct cross-origin Reddit, legacy opaque isolation, sessionStorage caveats, third-party/provider-partner requests, explicit full-content activation and the effect/limits of revocation. No persistent consent cookie, localStorage preference or analytics integration was added.

## Security regression

**PASS for audited source and local exercised behavior.**

- Main CSP and static/Worker header values are byte-for-byte unchanged from the audited HEAD and compact baseline. Host scripts/styles/connections remain same-origin; frame origins are the existing exact allowlist. `worker/security.ts` SHA-256 is `e244e919bbb542c3b4c60a0ee0f1e266b09de0e1ff74d31b8057a9a1ec75a463`; `public/_headers` is `ef99fef96b552105e604400eea8580b17311a3730efa872e7d45bc53f85fec6c`.
- Direct Reddit is `https://embed.reddit.com` with `allow-scripts allow-same-origin allow-popups`. It remains cross-origin from the host; the provider's same-origin permission does not confer parent DOM access. Top-navigation and popup escape are not granted. Autoplay/camera/microphone/fullscreen/clipboard remain explicitly denied for Reddit.
- Legacy adapter remains opaque with scripts/popups only, nonce-scoped widget CSP and exact child-frame origin. No host provider script is introduced. Existing **32 integrated Reddit checks**, **6 media unit/security tests** and **19 independent provider/CSP checks** pass. These include host/adapter parent access denial, script/frame rejection, safe sources, malformed/mismatched identities and provider 403/404/451 fallback.
- Actual loopback HTML/privacy/API responses retain restrictive headers; the legacy adapter retains its scoped exception and invalid external adapter URLs return 400. `headers.json` records observed values.
- Trusted-event, generation and connected-element checks remain intact. Synthetic `.click()` cannot enable full Reddit content. Revoke invalidates pending resolution. No arbitrary URL, markup or provider-script execution was added.
- Application source, public assets and workflow were inspected for credential exposure; no production/staging secrets were used or found. Local and CI credentials are test-only and omitted from output.

Public-preview DNS/redirect behavior remains the pre-existing direct-image limitation: ingestion/rendering rejects known private/local literals, but browser DNS answers/redirect destinations are not pinned. This is not newly accepted by this audit; public launch still needs its product/security decision.

## Exact commands and results

For local standalone browser modules, unless overridden:

```sh
WAAGD_BROWSERS=chromium,webkit
WAAGD_FRONTEND_BASE=http://127.0.0.1:8796
WAAGD_PLAYWRIGHT_MODULE=/Users/mikemmagik/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs
WAAGD_BROWSER_SESSION=mediaqa003
```

These are scoped environment values, not credentials. CLI suites require an opened task-owned browser session. The CLI configuration selects the existing bundled Chromium executable and headless mode; it adds no browser security bypass. The frontend development test overrides the origin to `http://127.0.0.1:4326`.

| Exact command (after runner prefix where applicable)                                                                         | Result                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm ci`                                                                                                                     | PASS; 395 packages; zero reported vulnerabilities                                                      |
| `npm run validate`                                                                                                           | PASS: typecheck/lint/format, 89 unit/automation tests, 1 build smoke, 41 backend entries               |
| `npm run build`                                                                                                              | PASS; Astro build and Worker `--dry-run` only                                                          |
| `node --test tests/regression-001.mjs`                                                                                       | PASS; 6 entries                                                                                        |
| `node --test tests/release-qa.mjs`                                                                                           | PASS; 5 entries                                                                                        |
| `node --test automation/tests/*.test.ts`                                                                                     | PASS; expanded to `automation/tests/automation.test.ts automation/tests/remediation.test.ts`, 56 tests |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=mediaqa003 node --test tests/backend.integration.test.ts`                       | PASS; 42 entries, including actual D1/API/frontend/pagination/deletion, 32 Reddit and 69 legal checks  |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=mediaqa003 node --test tests/regression-001.mjs`                                | PASS; 7 entries, including 19 browser provider/CSP checks                                              |
| `WAAGD_LIVE_REDDIT=1 WAAGD_BROWSER_SESSION=mediaqa003 node --test tests/release-qa.mjs`                                      | PASS; 6 entries; provider restrictions recorded, not playback acceptance                               |
| `WAAGD_FRONTEND_BASE=http://127.0.0.1:4326 WAAGD_BROWSER_SESSION=mediaqa003 node tests/frontend.browser.mjs`                 | PASS; 35 checks                                                                                        |
| `node work/media-qa-003/legal.mjs`                                                                                           | PASS; invokes unchanged `verifyLegal`, 69 checks each in Chromium/WebKit                               |
| `node tests/media-ux-001.browser.mjs`                                                                                        | PASS; 176 checks each in Chromium/WebKit                                                               |
| `node tests/media-polish-001.browser.mjs`                                                                                    | PASS; 36 cases each in Chromium/WebKit                                                                 |
| `node --test tests/media.test.ts`                                                                                            | PASS; 6 media/Reddit security tests                                                                    |
| `node tests/media-fix-002.live.mjs`                                                                                          | Exit 0; 12 real-provider observations, interpreted separately above                                    |
| `node work/media-qa-003/mouse.mjs`                                                                                           | PASS; independent mouse/focus/scroll/reset at six widths in both local engines                         |
| `node work/media-qa-003/live-layout.mjs`                                                                                     | PASS; actual WebKit four-post/two-state/six-width geometry                                             |
| `node work/media-qa-003/live-controls.mjs`                                                                                   | PASS; actual AMA Read more and comments footer at all six widths                                       |
| `node work/media-qa-003/normal-playback.mjs`                                                                                 | PASS; real WebKit normal video advances after deliberate provider click, plus six-width geometry       |
| `actionlint .github/workflows/media-firefox-qa.yml`                                                                          | PASS before each workflow push                                                                         |
| `npx prettier --check .github/workflows/media-firefox-qa.yml`                                                                | PASS before initial workflow push                                                                      |
| `git diff --exit-code 82c1faa -- src worker public shared db tests automation package.json package-lock.json wrangler.jsonc` | PASS; application and existing assertions unchanged                                                    |

Counts overlap and must not be summed. Exact expanded local commands/durations and raw logs are retained. Two preliminary CLI-backed integration attempts failed because no named browser session was open; the CLI's default Chrome channel was unavailable. Explicitly opening the task-owned session with the installed Chromium executable resolved the setup issue. Both original failure logs and successful complete reruns are retained. No application code or assertion was changed.

## GitHub Actions: scope, runs and evidence

The temporary workflow is `.github/workflows/media-firefox-qa.yml`. It triggers only on push to **`qa/media-polish-001`**, additionally filtered to changes to that workflow file. The report-only push therefore creates no extra test run. There is no pull-request, manual, schedule, deployment or main trigger.

Exact installation and test invocations are preserved in the committed workflow; the following are its browser commands (with the scoped Firefox environment described above):

```sh
npm ci
npm install --prefix "$RUNNER_TEMP/waagd-playwright" --no-save --package-lock=false --ignore-scripts playwright@1.64.0
node "$RUNNER_TEMP/waagd-playwright/node_modules/playwright/cli.js" install --with-deps firefox
npm run build:frontend
timeout 100s node work/media-qa-003/focused.mjs
timeout 60s node work/media-qa-003/media-debug.mjs
# Five separate executions and separately retained results:
timeout 45s node tests/media-ux-001.browser.mjs
timeout 150s node tests/media-polish-001.browser.mjs
timeout 60s node work/media-qa-003/legal.mjs
timeout 120s node tests/media-fix-002.live.mjs
```

It has `permissions: contents: read`, an exact-ref job guard, `ubuntu-24.04`, Node 24 (observed **24.21.0**, npm **11.19.0**), a **25-minute job timeout**, pinned official action commits and `persist-credentials:false`. `npm ci` installs project dependencies; Playwright **1.64.0** installs under `$RUNNER_TEMP/waagd-playwright` with `--no-save --package-lock=false --ignore-scripts`; its matching CLI installs Firefox and Linux dependencies with `install --with-deps firefox`. No package/lockfile edit is made. CI builds static frontend assets only; there is no deploy command, Cloudflare login, remote binding, DNS command or staging/production secret reference.

The generated Worker uses disposable local D1, explicit `--local`, isolated config/state, `envFiles:[]`, `remote:false`, loopback and a sentinel ID. The final harness generates its disposable write credential at runtime and does not print it. Initial workflow iterations used a public test-only placeholder in the generated-script text, visible in Actions' script echo; the final environment correction removes that value from logs. It was never a real production/staging credential. No temporary config/state directory is uploaded.

The existing media entry point runs five times. Separate JSON guards require an actual Firefox PASS with all **176** checks; browser launch NOT VERIFIED or exit 0 alone cannot pass. The compact result guard requires all **36** PASS cases. The unchanged legal export runs in Firefox. The existing real-provider recorder is attempted, with provider restrictions kept separate. Each failure is retained and contributes to a nonzero final gate; continuing to collect later suites does not waive earlier assertions. Always-run artifact upload retains `output/` logs/screenshots/trace/results for seven days. Final QA environment corrections add per-command limits (60s diagnostic, 45s per media suite, 150s compact, 60s legal, 120s live recorder, 100s focused observation) so stalled provider navigation cannot consume the whole job or prevent evidence upload.

| Run                                                                                                          | QA-only revision                           | Result / interpretation                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Initial Linux run](https://github.com/mikemmagik/weareallgonnadie/actions/runs/38688900461)                 | `5bd00c93b37c8fc9c52416f5209823dd3c7e9264` | **FAIL**; Firefox starts/navigates, first media execution times out waiting for Allow; logs/results uploaded                                                                                                                                                                                                                                                                                                                                                                                         |
| [Diagnostic environment retry](https://github.com/mikemmagik/weareallgonnadie/actions/runs/38689143167)      | `74d3fc58a61a5274ab5b7ce46f7074be83af3f66` | Five media FAIL results, compact FAIL and legal 69 PASS collected. Existing live recorder stalls after its first pre-activation screenshot; stopped after about 17 minutes. Run result **CANCELLED**, not PASS. Always-run artifact upload succeeded: [diagnostic evidence](https://github.com/mikemmagik/weareallgonnadie/actions/runs/38689143167/artifacts/11951757664).                                                                                                                          |
| [Bounded focused/environment retry](https://github.com/mikemmagik/weareallgonnadie/actions/runs/38690935597) | `aa566deb361beb686a5312b23604dcd65318f6a2` | **FAIL**, completed normally with all artifacts uploaded. Five media FAIL results (four Allow timeouts, one focus failure), compact focus FAIL, legal/privacy **69 PASS**. Independent keyboard focus loss confirmed; mouse activation, stable-page settings/revoke and four live host geometry/source-link checks observed. Full live media sampler did not complete within 120s. [Final artifacts](https://github.com/mikemmagik/weareallgonnadie/actions/runs/38690935597/artifacts/11951763406). |

These are isolated QA environment/diagnostic retries of the authorized Linux task, not application release or deployment runs. Only QA environment/workflow changes were made between them. Every workflow change passed `actionlint`, Prettier and source-integrity review before its QA-branch push.

The diagnostic trace locates the four repeated Allow timeouts at existing `verifyMediaUx` line 255: after Escape/decline/reload, the footer settings click is followed by a pagination response while the target/footer moves. The saved dialog lacks `open`, preference remains `decline`, and no provider resources load. This establishes a failed interaction/precondition, not consent bypass. One of five runs reaches the later actual Reddit focus assertion instead. The existing compact test independently fails at line 187 after trusted Enter at 320px. The focused bounded probe separates that focus result from the earlier pagination-sensitive scenario.

The final `focused-firefox.json` uses a single deterministic publication with no pagination. Enter at **320px** and Space at **375px** expand **300 → 620px**, but `document.activeElement` is **BODY** immediately, after another 100ms and after another 500ms. The next Tab reaches a host `source-link`, not provider controls. Mouse at **390px** retains iframe focus at all three samples. Stable-page settings opens in all three contexts, and revoke removes the iframe and restores approximately 300px. This independently reproduces the keyboard defect without the footer/pagination race, a real provider or the existing tests' immediate-only timing.

Final artifact ID: **11951763406**, archive digest **`sha256:91e39ff3226d86ee0df58e2d7c0231bc67a97e2aec98ecde639f1a841ce93d89`**. The final and earlier run logs/JSON/trace/screenshots were downloaded locally, preserving evidence beyond GitHub's seven-day artifact retention.

## Remaining limits, defects and release recommendation

**Confirmed application defect — MQ-003-F01, P2: Firefox loses keyboard focus on Reddit activation.** Reproduction: Firefox 157 on Ubuntu; allow session content, focus Play / view Reddit media, press Enter (320px) or Space (375px). Expected: expansion to 620px and keyboard focus in the official iframe. Actual: expansion succeeds, activation button is removed, but parent activeElement stays BODY through the additional observation intervals; Tab does not enter provider controls. Existing independent test assertions and a separate single-post probe reproduce the same failure. Mouse focus succeeds at 390px. Relevant implementation: `src/lib/render.ts:165–167` changes `frame.src`, removes the button and immediately calls `frame.focus({preventScroll:true})`. The exact browser event-order/root-cause correction is not established by this audit and was not implemented. This is an accessibility/acceptance defect; no consent bypass or new autoplay exploit is alleged.

The full Firefox application acceptance gate is **FAIL**, not missing-browser coverage and not a successful fixture pass qualified only by Reddit access. The original macOS launch blocker has been replaced with actual Linux application/test evidence. The five deterministic failures must be resolved and the unchanged suites must pass before an unconditional cross-browser verdict. Provider restrictions cannot explain a deterministic fixture focus failure.

The pagination-sensitive consent timeout remains a recorded failed interaction/test precondition. There is no observed unauthorized load or affirmative consent bypass. Its full Firefox session suite remains unaccepted; a stable-page focused result does not erase the original failed runs. No existing assertion was removed, softened or converted into a provider limitation.

Remaining **NOT VERIFIED** scenarios include complete native Safari/physical-device/assistive-technology coverage; actual BFCache and browser UI Duplicate Tab; Chromium Reddit content/playback and Firefox advancing playback samples; successful live short-link resolution; legacy live content; genuine private/deleted post examples; live TikTok photo, Instagram Reel/single-photo/video acceptance; arbitrary/future provider documents and endurance; deployed access controls, edge headers/TLS/DNS/caching, log/cookie behavior, remote configuration and rollback; real-host OpenClaw/Telegram readiness. These are separate from the confirmed focus result and from fixture layout acceptance.

**ACCEPTED LIMITATION for this task:** provider 403/unavailability with accessible host recovery links, plus the explicit Reddit summary/view-action model. A provider restriction is accepted as an observation limit, not as proof of live playback or a waiver of host accessibility. The pre-existing preview DNS/redirect risk still needs its public-launch product/security decision.

| Requested independent verdict                                     | Classification                                                            | Recommendation                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Local release acceptance**                                   | **FAIL**                                                                  | Chromium/WebKit compact UX and exercised no-autoplay behavior pass. Withhold complete release acceptance while Firefox deterministic focus/session acceptance fails.                                                                                                                                                                                        |
| **B. Suitable for updating access-restricted Cloudflare staging** | **FAIL** release recommendation; deployed staging itself **NOT VERIFIED** | Do not promote this candidate as accepted. Resolve/reaccept Firefox first, then request the separately authorized staging update and edge/access smoke test. No staging was accessed or changed here.                                                                                                                                                       |
| **C. Remaining public production blockers**                       | **FAIL / no-go**                                                          | Resolve Firefox acceptance; configure/verify operator identity and contact mailbox (`identity:null`, `contactEmail:null`, `contactVerified:false` remain); complete public-preview risk decision, disclosure/privacy review and separately authorized platform/access/TLS/logging/rollback checks. Provider live/device gaps must remain explicitly scoped. |

Recommend a narrowly scoped Firefox focus remediation and a review of the pagination-sensitive browser-test interaction, followed by independent rerunning of unchanged acceptance assertions. Application changes were prohibited here and none were made. No staging update, deployment, main merge or release tag is authorized by this report.

Task-owned local servers/browser sessions are closed and temporary standalone Worker/D1 state was removed. The final application-integrity diff and local validation pass. Evidence is retained locally under `output/`; `output/media-qa-003-evidence.zip` packages the report, workflow, QA helper scripts and local/CI evidence with a SHA-256 manifest. The final delivery commit is the Git commit containing this report, reported separately in the handoff to avoid a self-referential SHA.
