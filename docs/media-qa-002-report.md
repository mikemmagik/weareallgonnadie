# MEDIA-QA-002 — Independent Remediation Acceptance

**Local acceptance: REQUIRES OWNER DECISION. Access-restricted staging: NOT VERIFIED. Public production: FAIL acceptance gate / no-go.**

The live Reddit no-autoplay correction passes in automated WebKit for both supplied video posts: the summaries instantiate no video/audio, and full media plays only after deliberate activation. MQ-002 and MQ-003 pass the independently exercised checks. Complete MQ-001 acceptance remains **NOT VERIFIED** across the requested engines, and the loss of automatic full Reddit image/body rendering **REQUIRES OWNER DECISION**. Passing fixtures do not settle either condition.

## 1. Audited revision, authority and integrity

Audited **14 October 2026, Asia/Bangkok**, in `/Users/mikemmagik/Documents/waagd-media-qa-002`, on `qa/media-fix-002`.

- Audited application commit: **`0ae27452ef418e275fbb4a1e13815597d1b3c55a`**.
- Baseline branch `fix/media-qa-001` points to that same application commit.
- Actual remediation diff reviewed against parent **`42c1adbfec93ae04c985d0cd562fa8e30bc295c7`**, the MEDIA-QA-001 report commit. Its preceding media implementation is `78fe1607e52c4b59606c43e67451cf17c8290040`.
- Starting checkout was clean. Main remains `6e59767116a8b72f33d888d6677937fa2bef3c3c`.

The user's pasted request supplies authorization. AGENTS.md and `docs/media-qa-001-report.md`, `docs/media-fix-002-handoff.md`, `docs/media-ux-001-handoff.md` and `docs/decisions.md` supply reference context. Their historical conclusions are not fresh acceptance evidence or deployment authorization. Inspected the actual frontend, provider construction, consent controller, styles, privacy page, adapter, URL validators, static/Worker headers and changed tests.

Application code, existing assertions, shared contracts, dependencies, lockfile, configuration and migrations are unchanged. This report is the only committed change. Independent fixtures, scripts, logs, provider observations and screenshots are local ignored artifacts. No deployment, staging change, merge, push, tag, DNS, remote D1, existing local D1, OpenClaw or Telegram operation was performed.

## 2. Independent environment and reproducibility

macOS **27.0.1 (26A434), arm64**; Node **24.15.0**, npm **11.12.1**; locked Astro **7.3.8**, Wrangler **4.149.0**. Browser tooling is external to application dependencies: cached Playwright **1.64.0-alpha-1790635538000** and a fresh matching Firefox installation using external Playwright **1.64.0**.

The built Worker ran at **`http://127.0.0.1:8798`**, with a disposable configuration and fresh temporary D1 state. Migration commands explicitly used `--local`; the binding had a zero sentinel ID and `remote:false`. Env-file loading and remote bindings were disabled in the documented integration paths. Inherited Cloudflare credentials were removed before tools started. Disposable test tokens were confined to the local Worker. Four supplied Reddit URLs were seeded only into that temporary database for native Safari and focused controls checks.

The fresh standalone frontend development server requested port 4322 but started on **4323** because 4322 was occupied by another checkout. The final frontend result uses `http://127.0.0.1:4323`. The unrelated server was neither stopped nor changed.

Most commands use `python3 work/media-qa-002/run.py <log-stem> <command...>`. The runner retains the expanded command, scoped environment overrides, exit code, duration and raw log. Browser fixture suites and independent challenges are distinct from real-provider observation. Live scripts intercepted **only local publication API JSON** where fixtures were necessary; Reddit/TikTok/Instagram requests and responses were real and untouched. No provider restriction, browser security or application policy was bypassed.

## 3. MQ-001 — Real Reddit autoplay

**PASS for the supplied direct WebKit cases; NOT VERIFIED for complete cross-browser closure.**

The previous confirmed defect was normal and GIF-labelled Reddit MP4 playback after session consent/viewport entry without a Play action. The current application constructs an exact `https://embed.reddit.com` summary with `showmedia=false`. A separate native button, **Play / view Reddit media**, removes that parameter after a trusted action. The original frame sandbox and autoplay-denial policies remain. The code rejects scripted clicks, stale generations and disconnected cards.

Fresh `node tests/media-fix-002.live.mjs` observations:

| Supplied post                    | WebKit before activation                                                             | WebKit after activation                                                                      | Chromium live result                          |
| -------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Normal video `r/aww/j1bvtv`      | 200; actual title/author/community/actions visible; zero video/audio in four samples | 200; decoded normal video; intentional playback verified                                     | Summary and full frames 403; **NOT VERIFIED** |
| Animated MP4 `r/formula1/7qn3db` | 200; actual summary visible; zero video/audio in four samples                        | 200; GIF-labelled MP4; deliberate looping verified                                           | Summary and full frames 403; **NOT VERIFIED** |
| Image `r/aww/crpjwk`             | 200; actual summary; post image absent, community icon still visible                 | 200; actual duck image decoded, natural widths 352 and 640; no video/audio                   | 403; image **NOT VERIFIED**                   |
| Text `r/IAmA/z1c9z`              | 200; actual AMA title/attribution/actions; post body absent                          | 200; AMA body loaded with provider Read more control; expanded visual inspection also passes | 403; body **NOT VERIFIED**                    |

Before activation, `paused`, `muted`, `currentTime`, `duration` and `readyState` are **not applicable** because no post video/audio exists. This is absent media, not a paused, concealed or already-started video. Community icons and provider dependencies may load after global consent; `showmedia=false` is not a request-free privacy mode.

### Actual intentional playback samples

Each row is a fresh browser-tool observation after the trusted host action. Times below are UTC capture timestamps; the audit date above uses the client timezone. No content-frame scripts were injected to control playback.

| Post         | Capture time | paused | muted | currentTime (s) | duration (s) | readyState |
| ------------ | ------------ | ------ | ----- | --------------- | ------------ | ---------- |
| Normal video | 06:30:04.716 | false  | true  | 5.6173          | 20.8         | 4          |
| Normal video | 06:30:05.745 | false  | true  | 6.6294          | 20.8         | 4          |
| Normal video | 06:30:06.758 | false  | true  | 7.6383          | 20.8         | 4          |
| Normal video | 06:30:07.766 | false  | true  | 8.6456          | 20.8         | 4          |
| Animated MP4 | 06:30:27.428 | false  | true  | 1.0247          | 2.466        | 4          |
| Animated MP4 | 06:30:28.458 | false  | true  | 2.0377          | 2.466        | 4          |
| Animated MP4 | 06:30:29.467 | false  | true  | 0.5622          | 2.466        | 4          |
| Animated MP4 | 06:30:30.477 | false  | true  | 1.5753          | 2.466        | 4          |

The normal-video position advances; the animated MP4 wraps and continues. All have `autoplay=false`, illustrating why the previous attribute-only checks were insufficient. A second independent live recorder verified the same summary/full-content boundary using keyboard Enter and measured normal-video advancement **5.1837 → 6.1916 → 7.2021s**.

Original host attribution, exact original URLs and recovery explanations remained outside every frame. Real provider controls remained supplied by Reddit. A focused live check reached the normal video's comment/footer controls at all six widths, using provider internal scrolling at wider sizes. AMA Read more expanded the provider body from **316px to 954px**; the LAST UPDATE paragraph was scrolled into view and visually inspected. Full-body access is verified, while the initial full-content frame still uses Reddit's own collapsed presentation.

Direct WebKit frame inspections deny parent DOM access. Revocation removes the activated frame and action. No observed pre-activation autoplay remains in the exercised live WebKit cases.

### Legacy adapter and provider diagnostics

The unchanged opaque isolation model remains distinct. Actual widgets.js returned 200 and generated `showmedia=false` URLs for both legacy video examples. Chromium content returned 403. WebKit content returned 200 but its provider `frame-ancestors` policy rejected the opaque ancestor; the frame body was empty. **Legacy live content/no-autoplay is NOT VERIFIED**, not a pass inferred from absent media. Deterministic adapter security and content-selection tests pass.

Direct WebKit provider logs retain stylesheet-CSP refusals, bad-URL warnings and a reporting-beacon failure. Provider partner requests, including an `id.rlcdn.com` image URL, occur inside the allowed provider content. There is no new host analytics/advertising integration in the remediation diff. These observations support the privacy disclosure about provider service partners; they do not establish zero third-party tracking after consent. Chromium's network-security restriction is recorded without bypassing it.

Primary raw evidence: `output/playwright/media-qa-002/reddit-live-results.json` and `output/playwright/media-fix-002/` screenshots. Supplemental six-width/body/control evidence is under the QA-002 root.

## 4. Reddit product tradeoff

**REQUIRES OWNER DECISION — automatic full image/body rendering is lost.** Neither the handoff nor the decisions document provides explicit owner approval to waive the original automatic full image/text behavior. This audit does not grant it.

| Question                        | Independent assessment                                                                                                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another privacy-consent prompt? | **PASS**: the control says Play / view Reddit media; it has no privacy choice or second dialog. The one session preference still applies.                                                                                                                                                 |
| Additional action obvious?      | **PASS for discoverability**: full-width native button below the frame, separate from the source links; accessible name includes the post title.                                                                                                                                          |
| Useful summary?                 | **PASS in live WebKit/Safari**: actual title, community/author attribution, upvotes, comment/copy links and comment count. Chromium's block means usefulness there is **NOT VERIFIED**.                                                                                                   |
| Playback indicated?             | The button explicitly says Play; rendered privacy explains that video may immediately play or GIF-labelled media animate. The card has no additional explicit autoplay-warning sentence. Owner should assess whether the mixed Play/view wording is sufficient for this tradeoff.         |
| Attribution/source recovery?    | **PASS**: both provider attribution/actions and independent host source/recovery links remain.                                                                                                                                                                                            |
| Blank space?                    | Substantial: the 620px host area reserves a roughly 574px summary frame for a 240px actual summary body, about **334px unused space** at all measured widths. It also leaves blank space after short text content. This is a product concern requiring a decision, not silently accepted. |
| Mobile usability?               | **PASS for tested layout/access**: 320/375/390px host pages do not overflow; button height is about 44px and readable. Tall reserved space increases scrolling.                                                                                                                           |
| Keyboard activation?            | **PASS**: existing suite tests trusted Enter; independent fixture tests Space; live WebKit recorder also uses Enter. Scripted `.click()` does not activate.                                                                                                                               |
| Activated-frame persistence?    | **PASS**: frame identity/full-content URL survive repeated scrolling; no duplicate summary/full navigations.                                                                                                                                                                              |
| Revocation/reset?               | **PASS**: all frames/actions disappear, pending resolutions cannot restore them, and reallow/reload starts from an unactivated summary.                                                                                                                                                   |

A single global consent dialog is preserved, but every Reddit image/text post requires an extra content action. Native provider Read more may add another body-expansion action for long text. The strict no-autoplay requirement has not been relaxed. The owner must explicitly accept this rendering/space tradeoff or request a reviewed alternative; no unsupported classification, scraping, metadata service or contract change was introduced here.

## 5. MQ-002 — Rendered privacy accuracy

**PASS for current local implementation disclosure.** Independently read rendered `/privacy/` in Chromium, WebKit and native Safari; compared it with actual behavior/code. The existing legal browser suite passed **69 checks**, including the corrected disclosure.

The page accurately distinguishes direct cross-origin Reddit frames with Reddit-origin same-origin permission from the legacy opaque adapter. It describes session-wide consent, sessionStorage persistence/failure/tab-copy caveats, lazy loading, initial summaries, explicit Reddit activation, the image/body restriction, and possible immediate video/GIF playback afterward. Other players **request** no autoplay; there is no blanket guarantee that every provider video stays paused.

It discloses direct third-party requests, provider/partner requests, account recognition and provider cookies/storage subject to browser settings. Revocation stops future automatic loads and removes current frames but cannot undo past requests or clear provider cookies. The statement about no application analytics is scoped to application code, alongside the explicit external-provider caveat.

The permanent homepage disclaimer, `/legal`, operator placeholders, removal/contact links, Cloudflare policy links and safe external-link attributes remain. Source comparison confirms those components were not edited. Operator configuration still has `identity:null`, `contactEmail:null`, `contactVerified:false`; rendered notices explicitly say they must be completed before public launch. **PASS here is factual disclosure acceptance, not legal-compliance or public-launch certification.**

## 6. MQ-003 — Geometry and reliability

**PASS in available Chromium and WebKit engines; Firefox NOT VERIFIED.** The corrected assertion measures the actual `.media` rectangle against the controller's real **320px** margin, explicitly returns to the top before Allow, checks that focus restoration preserves distance, checks no frame outside, then positions using current geometry and checks one frame inside. Repeated scrolling and fallback behavior remain asserted. No committed assertion was removed or weakened.

Five consecutive unmodified media-suite executions, with each result retained separately:

| Run / evidence file            | Chromium 155.0.8059.12 | WebKit 26.6          | Firefox build 1553               |
| ------------------------------ | ---------------------- | -------------------- | -------------------------------- |
| 1 — `media-run-1-results.json` | **PASS**, 176 checks   | **PASS**, 176 checks | **NOT VERIFIED**, launch failure |
| 2 — `media-run-2-results.json` | **PASS**, 176 checks   | **PASS**, 176 checks | **NOT VERIFIED**, launch failure |
| 3 — `media-run-3-results.json` | **PASS**, 176 checks   | **PASS**, 176 checks | **NOT VERIFIED**, launch failure |
| 4 — `media-run-4-results.json` | **PASS**, 176 checks   | **PASS**, 176 checks | **NOT VERIFIED**, launch failure |
| 5 — `media-run-5-results.json` | **PASS**, 176 checks   | **PASS**, 176 checks | **NOT VERIFIED**, launch failure |

An independent eight-card challenge measured the same boundary in both available engines, with viewport **844px**:

| Stage                     | Actual media top / bottom | Margin boundary | Target iframe count |
| ------------------------- | ------------------------- | --------------- | ------------------- |
| Initial                   | 6440.4375 / 7060.4375     | 1164px          | 0                   |
| Deliberately just outside | 1194.4375 / 1814.4375     | 1164px          | 0                   |
| Deliberately inside       | 1144.4375 / 1764.4375     | 1164px          | 1                   |

After scrolling into visible range, actual fixture content loaded. Four repeated scroll cycles made **one** summary navigation; after deliberate Space activation there were exactly **two total** target navigations, summary plus full, and no duplicates over three further cycles. The iframe DOM identity persisted. WebKit's native `loading=lazy` can delay the network navigation beyond the host's construction threshold; the independent recorder moved it into visible range before inspecting provider DOM. No immediate network-load claim is based only on iframe creation.

Independent final result: **26 checks per available engine**, including top-navigation denial, activation persistence/reset and rendered privacy. Evidence: `independent-results.json`.

## 7. Browser compatibility matrix and Firefox attempts

| Browser                                               | Deterministic application coverage                                                               | Live Reddit                                                                                     | Qualification                                                                                                                        |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Chromium **155.0.8059.12**, build 1247                | **PASS**: five media runs, independent challenge; backend/browser/security/legal/frontend suites | **NOT VERIFIED**: supplied direct posts return 403                                              | Real TikTok playback and Instagram rendering/carousel interaction separately observed                                                |
| Automated WebKit **26.6**, build 2368                 | **PASS**: five media runs and independent challenge                                              | **PASS** for supplied direct summary/activation/video/image/text cases                          | Automated engine testing; not native Safari certification                                                                            |
| Playwright Firefox target **156.0**, build 1553       | **NOT VERIFIED**                                                                                 | **NOT VERIFIED**                                                                                | Fresh startup and all five media attempts exit before navigation with `Could not find profile folder`                                |
| Fresh Playwright Firefox target **157.0**, build 1555 | **NOT VERIFIED**                                                                                 | **NOT VERIFIED**                                                                                | Matching external 1.64.0 download; existing independent profile/headless and headed retries both fail before controllable navigation |
| Native Safari **27.0.1**, build **22625.1.29.11.28**  | Focused smoke **PASS**                                                                           | Actual normal/animated summaries before action; normal playback/animation after action observed | Native network/status/full DOM sample matrix and six-width certification **NOT VERIFIED**                                            |
| Native standard Firefox / Linux Firefox               | **NOT VERIFIED**                                                                                 | **NOT VERIFIED**                                                                                | No standard Firefox app in inspected application locations; Docker daemon unavailable, so no working Linux runtime was available     |
| Physical iOS/Android devices                          | **NOT VERIFIED**                                                                                 | **NOT VERIFIED**                                                                                | Responsive desktop-engine viewports do not substitute for devices                                                                    |

The fresh Firefox retry used existing project-local profiles and `TMPDIR=/private/tmp`. Headless build 1555 reproduced the profile error; headed launch logged `sandbox_extension_issue_file_to_process ... Operation not permitted` and helper/service errors, then exited. The underlying OS/browser cause is not proven. No sandbox/security setting was changed. Zen/Tor were not substituted for Firefox.

Native Safari opened one task-owned tab against the real local API. It showed one consent dialog, loaded nearby summaries after Allow, and kept distant placeholders. The normal-video summary showed actual title/actions and no post video; after the host action the decoded video appeared with provider playback/captions/fullscreen/volume controls. A deliberate replay was observed at **0:00 / 0:20**, then **0:20 / 0:20**. The animated summary had no animation; after activation two screenshots showed different Formula 1 frames. Same-tab navigation retained consent and reset activation. Settings decline removed frames/actions; reload retained decline. Footer Privacy opened the actual corrected page. The QA tab was closed, preserving the initial Safari tab.

Native observations are retained as an observer summary in `native-safari-smoke.json`; raw AX/screenshots were displayed in this chat's tool transcript. Native `paused/muted/currentTime/readyState`, network counts/status and complete security/mobile/BFCache coverage are **NOT VERIFIED**. The full machine-readable media samples above come from automated WebKit, not Safari.

## 8. Security regression

**PASS for exercised local static/Worker and browser boundaries.** Actual local response headers were captured for `/`, `/privacy/`, `/legal/`, API success/error and `/embed/reddit`; also inspected `public/_headers` and `worker/security.ts`. Those main policies are unchanged by the remediation.

- Main CSP retains `default-src 'none'`, same-origin scripts/styles/connections, no unsafe inline/eval, no objects/forms/base and no parent embedding. External frames are restricted to self plus exact approved Reddit/YouTube/TikTok/Instagram HTTPS origins. Existing HTTPS image permission is unchanged.
- Direct Reddit uses `allow-scripts allow-same-origin allow-popups` at the validated remote Reddit origin. It has no top-navigation or popup-escape token, and denies autoplay/camera/microphone/fullscreen/clipboard. Live parent-access checks and fixture challenges deny parent DOM access.
- Independent **trusted provider button clicks** attempting `top.location` were blocked in Chromium and WebKit. The host URL did not change. This is a tested boundary, not only sandbox-token inspection.
- Legacy adapter retains opaque CSP `sandbox allow-scripts allow-popups`, exact widget script plus nonce, exact Reddit frame origin and scoped inline styles. No same-origin permission is added. Existing browser attacks against arbitrary scripts/frames and untrusted inline execution pass separately from direct-frame checks.
- Provider HTML is discarded server-side; text enters the host through text nodes. Injection tests, source URL/ID checks and safe `noopener noreferrer` original links pass. No provider script runs in the parent host DOM.
- Short-link resolution retains a fixed official HTTPS endpoint, redirect refusal, **5s timeout**, **64KiB body bound** and exact same-ID post revalidation on both server and frontend. Malicious/oversized markup, mismatched identity, unsupported host and revocation-during-resolution tests pass. Live successful short-link content is not claimed.
- No new application provider origin, arbitrary host script, script proxy, tracking service, authentication change, D1 migration or external metadata service appears in the diff. Actual provider partner resources remain a disclosed post-consent behavior.

Evidence: `actual-headers.json`, `adapter-headers.txt`, `adapter-body.txt`, audited diff, independent results, 6 Reddit unit/security tests, integrated 32 Reddit browser checks and independent CSP regression. Deployed edge access controls, platform-generated error headers, TLS/DNS, remote logs/cookies and staging configuration are **NOT VERIFIED**; no staging was accessed.

## 9. Consent and other media regression

**PASS for the exercised session lifecycle and six-width fixtures** in Chromium and WebKit: exactly one dialog, zero external requests before consent, allow/decline persistence, fresh-context prompting, conservative keyboard focus/trapping/Escape, settings, revocation, lazy loading, pending-resolution invalidation and no repeat privacy dialog per post. Reload/reallow never restores Reddit playback activation. Synthetic persisted-pageshow and unavailable-storage cases pass; true native BFCache restoration remains **NOT VERIFIED**.

All requested widths **320, 375, 390, 768, 1024, 1440** were exercised. The fixtures cover TikTok 9:16 video/image-player presentation and distinct Instagram post/Reel/carousel layouts, source links, provider fixture controls and no page overflow. Independent live observations add:

| Provider case                                                        | Fresh result                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TikTok `@scout2015/video/6718335390845095173`                        | Both engines: 200, actual poster/account/play/volume/progress/settings/fullscreen visible; six widths fit 9:16 with no provider/page horizontal overflow. No video element existed in the pre-Play samples; poster/00:00 controls were visible. After trusted provider Play, actual readyState-4 playback advances: Chromium **1.3854 → 2.3868 → 3.3925s**, WebKit **1.0872 → 2.0954 → 3.1033s**, duration about **10.495s**, paused=false/muted=false. |
| Instagram regular video `/p/fA9uwTtkSN/`                             | Both engines: 200 and actual post/poster/actions rendered at six widths. Video remains paused=true/currentTime=0/readyState=0 in three pre-action samples. Intentional successful playback **NOT VERIFIED**.                                                                                                                                                                                                                                            |
| Instagram image carousel `/p/C4nMA7mSl-2/`                           | Both engines: 200, actual nebula images/actions; six widths without page/provider horizontal overflow; trusted Next action changes the visible slide, confirmed by screenshots. No video/audio in the observations.                                                                                                                                                                                                                                     |
| Live Instagram Reel / distinct single-photo post / TikTok photo post | **NOT VERIFIED**; no fresh eligible source was supplied for those distinct live cases. Their deterministic layout coverage is not live playback certification.                                                                                                                                                                                                                                                                                          |
| Reddit direct content in WebKit                                      | All four supplied posts before/after activation fit the host page at six widths; wider normal-video/image and expanded AMA content require provider internal scrolling. Footer/comments remain reachable; host recovery links remain outside the frame.                                                                                                                                                                                                 |

No unexpected video autoplay was observed in these exercised live cases. Absence of instantiated TikTok media before Play is distinguished from Instagram's present-but-unready paused video. No blanket future/all-provider guarantee follows from the observed window.

The retained fixed-height provider presentation and internal scrolling are an **ACCEPTED LIMITATION of the existing integration model for the observed content**, not a guarantee that every caption/aspect ratio fits. This does not accept the separate new Reddit image/body activation tradeoff. Direct external preview image DNS/redirect control remains the prior **REQUIRES OWNER DECISION** risk; no change or waiver is inferred here.

## 10. Exact commands and results

Commands ran in the audited checkout via the retained runner. For browser commands unless overridden: `WAAGD_FRONTEND_BASE=http://127.0.0.1:8798`, `WAAGD_PLAYWRIGHT_MODULE=/Users/mikemmagik/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs`, `WAAGD_BROWSER_SESSION=mediaqa002`. These are local tooling values, not production credentials. Counts overlap and must not be summed.

| Exact command/scenario                                                                                                                                            | Result                                                                                                     | Log stem under QA-002 evidence root |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `npm ci`                                                                                                                                                          | **PASS**, 395 packages; zero npm-reported vulnerabilities                                                  | `npm-ci`                            |
| `npm run validate`                                                                                                                                                | **PASS**, typecheck/lint/format; 89 unit/automation tests; 1 build smoke; 41 real local D1/backend entries | `validate`                          |
| `npm run build`                                                                                                                                                   | **PASS**, static build and Worker **dry run**, no deploy                                                   | `build`                             |
| `node --test tests/regression-001.mjs`                                                                                                                            | **PASS**, 6 entries                                                                                        | `regression`                        |
| `node --test tests/release-qa.mjs`                                                                                                                                | **PASS**, 5 entries                                                                                        | `release`                           |
| `node --test automation/tests/*.test.ts` — expanded to `automation/tests/automation.test.ts automation/tests/remediation.test.ts`                                 | **PASS**, 56 tests                                                                                         | `automation`                        |
| `WAAGD_BROWSER_TESTS=1 node --test tests/backend.integration.test.ts`                                                                                             | **PASS**, 42 entries; real D1/API/frontend plus 32 Reddit security/browser and 69 legal checks             | `backend-browser`                   |
| `WAAGD_BROWSER_TESTS=1 node --test tests/regression-001.mjs`                                                                                                      | **PASS**, 7 entries including host CSP browser challenge                                                   | `regression-browser`                |
| `WAAGD_FRONTEND_BASE=http://127.0.0.1:4323 WAAGD_BROWSER_SESSION=mediaqa002front node tests/frontend.browser.mjs`                                                 | **PASS**, 35 checks against this checkout's Astro dev server                                               | `frontend-browser-correct-origin`   |
| `node tests/legal.browser.mjs http://127.0.0.1:8798`                                                                                                              | **PASS**, 69 checks against built Worker                                                                   | `legal-browser`                     |
| `node tests/media-ux-001.browser.mjs` — five consecutive executions                                                                                               | **PASS**, Chromium/WebKit 176 each each run; Firefox **NOT VERIFIED**                                      | `media-run-1` through `media-run-5` |
| `node --test tests/media.test.ts`                                                                                                                                 | **PASS**, 6 provider/Reddit security tests                                                                 | `reddit-unit-security`              |
| `node tests/media-fix-002.live.mjs`                                                                                                                               | Exit 0; actual provider results in §3; exit 0 is **not** blanket acceptance                                | `live-reddit`                       |
| `node work/media-qa-002/independent.mjs`                                                                                                                          | Final **PASS**, 26 checks per available engine                                                             | `independent-final`                 |
| `node work/media-qa-002/live-layouts.mjs`                                                                                                                         | Exit 0; ten independent live cases, six-width measurements; interpreted results in §9                      | `live-layouts`                      |
| `node work/media-qa-002/reddit-controls.mjs`                                                                                                                      | Final **PASS**, actual AMA expansion and reachable Reddit footer/comments at all six widths                | `reddit-controls-observed`          |
| `node work/media-qa-002/browser-setup.mjs`                                                                                                                        | Chromium/WebKit startup **PASS**; cached Firefox **NOT VERIFIED**                                          | `browser-setup`                     |
| `PLAYWRIGHT_BROWSERS_PATH=<checkout>/work/media-qa-002/browsers node /Users/mikemmagik/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/cli.js install firefox` | Fresh Firefox build 1555 installed; installation is not browser acceptance                                 | `firefox-fresh-install`             |
| `PLAYWRIGHT_BROWSERS_PATH=<checkout>/work/media-qa-002/browsers TMPDIR=/private/tmp node work/media-qa-002/firefox-retry.mjs`                                     | Headless and headed **NOT VERIFIED**, startup errors retained                                              | `firefox-fresh-retry`               |

Document formatting and final Git/source-integrity checks accompany delivery. Native Safari used `cua_repl`, independently of Playwright.

### Failed observations and setup corrections retained

The first frontend run and a fresh-session retry used occupied **4322**, belonging to the older `waagd-integration` checkout, and failed at `External meme image waits for interaction`. Correcting to the actual QA server's **4323** passed the unchanged 35-check suite. Those failures are environment selection errors, not defects in the audited revision.

The independent scratch challenge initially supplied a timestamp without contract-required milliseconds, causing feed rejection; the valid fixture then exposed WebKit native iframe deferral while still below the visible viewport. The final observer retained all geometry checks and moved the already-created frame into visible range before provider DOM inspection. Both engines passed. Existing committed tests were untouched.

The scratch Reddit-controls observer initially bound a frame before its initial provider navigation settled; it was detached. After awaiting the real summary, it incorrectly assumed the provider would relabel its expanded button Read less. Real inspection instead showed body-height expansion and an unchanged Read more label. The final challenge checks actual expansion and visible LAST UPDATE content, rather than the unsupported label assumption. Earlier logs/results remain. No existing assertion was changed.

An initial combined regression invocation ran the two real regression files while mistakenly naming two nonexistent automation files; it produced 11 regression entries. All three requested commands were subsequently executed separately with the actual automation paths above. Only the separately verified results are credited.

## 11. Remaining limitations and new defects

**New confirmed application defects: none in the exercised scope.** The original WebKit autoplay and inaccurate privacy findings no longer reproduce under the new activation model, and the corrected geometry test passed five consecutive runs per available engine. This does not mean all release requirements are met.

- **REQUIRES OWNER DECISION:** full Reddit image/body activation and its additional scrolling/blank-space cost; no explicit owner acceptance exists.
- **NOT VERIFIED:** Firefox behavior in any requested live/deterministic application path; Chromium live Reddit due 403; legacy live content due 403/provider ancestor policy; successful live short-link resolution.
- **NOT VERIFIED:** complete native Safari matrix, physical devices, native assistive technology, actual BFCache restoration and browser UI Duplicate Tab; arbitrary providers/captions/video sources, endurance and future provider behavior.
- **NOT VERIFIED:** live Reel, distinct Instagram single-photo and TikTok photo acceptance; actual Instagram video playback, genuine private/author-deleted post cases.
- **REQUIRES OWNER DECISION:** carried external-image DNS/redirect exposure, as recorded in prior QA; no new acceptance is inferred.
- **NOT VERIFIED:** deployed access restrictions, edge headers/TLS/DNS/caching, logs/storage, remote bindings and actual-host automation/rollback readiness. Existing operator/verified-contact prerequisites remain unmet in source/local rendering.

Provider denial/unavailability and engine startup failure are not reported as application autoplay defects. Conversely, a blocked/empty frame is never used as no-autoplay proof. No owner-controlled limitation is silently classified as accepted.

## 12. Three independent verdicts and next action

| Scope                            | Verdict                                                                         | Release implication                                                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. LOCAL ACCEPTANCE**          | **REQUIRES OWNER DECISION**; full requested browser acceptance **NOT VERIFIED** | MQ-002/MQ-003 and exercised WebKit MQ-001 pass. The candidate can be examined locally, but unconditional remediation acceptance is withheld pending the Reddit product decision and missing browser evidence.                                                                              |
| **B. ACCESS-RESTRICTED STAGING** | **NOT VERIFIED**; promotion **REQUIRES OWNER DECISION**                         | Existing staging was not accessed or changed. Do not represent local results as staging acceptance. Any separately authorized diagnostic staging exercise must state the unresolved product/browser limits.                                                                                |
| **C. PUBLIC PRODUCTION**         | **FAIL acceptance gate — no-go**                                                | The required product decision and browser/provider verification remain open, and configured operator/verified-contact and deployed-platform prerequisites are not satisfied by this local audit. This is a release-readiness verdict, not a newly discovered application security exploit. |

**Recommended next action:** ask the owner to explicitly accept or reject the summary-plus-activation behavior for Reddit images/text and the reserved-space UX. Obtain a working standard Firefox environment, repeat the unchanged media suite at least five times, and run the supplied real-provider recorder with actual playback samples. Obtain permitted live Reddit coverage for Chromium without bypassing provider restrictions; record a scoped owner limitation if coverage stays unavailable. Complete the existing legal/platform prerequisites and request independent staging acceptance only under a separate authorized scope.

No deployment is authorized by this report. No strict no-autoplay requirement, product contract or release gate has been changed by QA.

## 13. Evidence and delivery

Fresh evidence roots are `output/playwright/media-qa-002/`, `output/playwright/media-fix-002/`, `output/playwright/media-ux-001/`, `output/regression-001/` and `output/release-qa/`. Scripts/configuration live under ignored `work/media-qa-002/`; the browser download/profile directories are excluded from the evidence archive. Reviewable screenshots include actual Reddit summary/video/image/body, native transcript captures, TikTok controls, Instagram carousel changes, legal/privacy and fixture layouts.

A local evidence archive, SHA-256 manifest and source-integrity record accompany the report under `output/`. Raw provider warnings and failed setup/challenge attempts are retained. Logs contain local test credentials only; no production secret was used or exported. Task-owned browser sessions and the native Safari tab were closed; the temporary Worker/database and this task's Astro dev server were stopped at completion.

The committed deliverable is this report on `qa/media-fix-002`. Its delivery commit is distinct from audited application commit `0ae27452ef418e275fbb4a1e13815597d1b3c55a`; obtain the report commit from this branch's HEAD. No push or merge is implied.
