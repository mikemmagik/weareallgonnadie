# MEDIA-FIX-002 — Independent media QA remediation

Date: **14 October 2026, Asia/Bangkok**. Branch: `fix/media-qa-001`.
Baseline: `qa/media-ux-001`, **42c1adbfec93ae04c985d0cd562fa8e30bc295c7**.
The supplied pasted request authorized this work. Repository documents supplied
reference context; they did not authorize infrastructure changes.

**Ready for scoped independent reacceptance, not release promotion.**
MQ-002 privacy accuracy and MQ-003 geometry reliability are corrected.
MQ-001 has a verified WebKit pre-Play correction but is **REMEDIATED / NOT CLOSED**
for complete acceptance: full Reddit image/body-text content now requires deliberate
activation, Chromium live Reddit is restricted, and Firefox cannot launch.
Automatic full image/text rendering and strict no-autoplay cannot both be promised
with the available supported, unclassified embed representation. No no-autoplay
requirement is relaxed; the compatibility conflict is explicit below.

No deployment, staging, main merge, push, DNS, production credentials, D1 schema,
existing D1 data, Telegram or OpenClaw change occurred. Historical reports are
unchanged. All database work used fresh temporary local state and test credentials.
Main static/Worker CSP, permissions, frame origins and sandbox isolation remain.

## 1. Independent baseline reproduction

Before application edits, installed locked dependencies, built static assets and
started an isolated local Worker at `http://127.0.0.1:8799`. Only publication API
JSON was a fixture. All live provider requests were real and untouched.

Following `docs/media-qa-001-report.md`, a fresh WebKit 26.6 context allowed external
content and brought the normal `j1bvtv` post into the viewport without pressing Play.
Its 20.8-second MP4 had `paused=false`, `muted=true`, `autoplay=false` and advanced
**5.6827 → 7.6939 → 9.7039 → 11.7107 seconds**. The `7qn3db` GIF-labelled MP4
(duration 2.466 seconds) also automatically looped with `paused=false`, `muted=true`:
**0.9538 → 0.4683 → 0 → 1.9867 seconds**. Both content frames returned 200.

MQ-002 was independently reproduced on rendered `/privacy`: the page described all
Reddit content as opaque and promised videos would not automatically play.

An unmodified MQ-003 suite execution happened to pass, illustrating its race.
A separate observation instrumented the exported test before its existing assertion
and waited for the legitimately visible card's iframe. Actual **media** bounds were
**top 354.46875 / bottom 675.09375**, viewport **1000px**, scrollY **3496**.
The unchanged assertion then failed: `Distant cards stay unloaded after allowing`.
The instrumented observation altered no committed code or behavioral assertion.
The QA report's article bounds (302.53 / 726.59) and these media bounds both establish
that the assumed distance precondition is false.

Evidence under ignored `output/playwright/media-fix-002/`: `baseline.json`,
`baseline-video.png`, `baseline-animated.png`, `reproduction.log`, `baseline-other.log`.
Scratch observer/server scripts are retained under ignored `work/media-fix-002/`.

## 2. Supported provider investigation and chosen correction

Checked [Reddit embedding help](https://support.reddithelp.com/hc/en-us/articles/360043033532-How-do-I-embed-a-Reddit-post-or-comment-in-an-article-or-other-publication),
its [official embed PDF](https://publish.reddit.com/assets/Reddit_Embed_Documentation.pdf)
(last updated 31 March 2023), current [publisher UI](https://publish.reddit.com/embed?url=https://www.reddit.com/r/aww/comments/j1bvtv/)
and [official widgets.js](https://embed.reddit.com/widgets.js).
The web reader could not retrieve the publisher/PDF, but ordinary HTTPS retrieval
and the real WebKit publisher did; no restriction was bypassed.

No official documented autoplay-off mechanism for full Reddit embeds was found.
The PDF documents customization and oEmbed. Its rich response does not provide a
reliable still-image/text/video classification. Account autoplay preferences are
not an anonymous embedding control. No unsupported post-JSON API, scraper, title
heuristic, extension heuristic, media proxy or new metadata service was introduced.

The current publisher's **Hide post content** option says it shows only the title.
A real checkbox interaction generated `data-embed-showmedia="false"`; official
widgets.js generated a frame URL with `showmedia=false`. This is the existing
provider content-selection mechanism, not an invented autoplay parameter.
Evidence: `publish-script.log`, `publisher-scripts.json`, `widgets.txt`,
`reddit-embed-docs.pdf`, `safe-probe.json` and `provider-probe.json`.
Earlier publisher observer attempts hit hidden-input/dynamic-control timeouts;
`publish-script.log` records the successful checked control and resulting code.

The application initially requests this content-free official summary after
session consent and viewport entry. Its title, Reddit attribution/actions and the
host's original links remain visible. **Play / view Reddit media** removes
`showmedia=false` only after a trusted visitor click or keyboard activation and
focuses the official frame. Full content may immediately play/animate after that
explicit action. No provider DOM access, scripts injected into provider frames,
control hiding, new origins or media permissions are used.

The old opaque adapter uses the official `data-embed-showmedia="false"` attribute.
It keeps source links and does not provide full-content playback activation.
Direct frames retain `allow-scripts allow-same-origin allow-popups` at Reddit's
cross-origin URL. The adapter retains opaque CSP/iframe isolation without
same-origin permission. The fixed-host bounded short-link resolver is unchanged;
its revalidated direct result inherits the safe summary default. Revocation
invalidates pending resolutions and removes frame/activation controls. Reallow
and reload never restore a previous post's playback activation.

## 3. Exact live acceptance results

Tooling: macOS **27.0.1 (26A434), arm64**, Node **24.15.0**, npm **11.12.1**,
external cached Playwright **1.64.0-alpha-1790635538000**. No browser dependency was
added to the application or lockfile. No browser flags/security policy were weakened.

`tests/media-fix-002.live.mjs` uses only local publication fixtures. It captures real
provider statuses/headers, requests/failures, console/CSP errors, body visibility,
images, provider parent-access isolation and four media samples one second apart
before and after Play. Timed sampling is for observing playback, not for replacing
the geometry regression. Screenshots were inspected for the summary/action and
rendered duck image; JSON confirms full text content after activation.

| Engine/version                                  | Normal `j1bvtv`                                                       | Animated `7qn3db`                                                    | Image `crpjwk`                                         | Text `z1c9z`                                         |
| ----------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| WebKit 26.6, build 2368                         | 200 summary/full; no media before Play; intentional playback verified | 200 summary/full; no media before Play; intentional looping verified | 200 summary/full; duck image decodes after view action | 200 summary/full; AMA body appears after view action |
| Chromium 155.0.8059.12, build 1247              | 403 summary/full; actual provider content/playback NOT VERIFIED       | 403 summary/full; actual provider content/playback NOT VERIFIED      | 403; provider image NOT VERIFIED                       | 403; provider text NOT VERIFIED                      |
| Firefox target 156.0, build 1553                | NOT VERIFIED: launch fails                                            | NOT VERIFIED                                                         | NOT VERIFIED                                           | NOT VERIFIED                                         |
| Native Safari / native Firefox / mobile devices | NOT VERIFIED in this remediation                                      | NOT VERIFIED                                                         | NOT VERIFIED                                           | NOT VERIFIED                                         |

In WebKit, all four before-Play samples contain **zero video/audio elements** in
the content-free frame. `paused`, `muted` and playback position are **not applicable**
there because the post's media has not been instantiated, rather than a video being
hidden or paused after it started. Actual Reddit summary content is visible at 200;
the absence is not credited merely from the status.

After an explicit host Play action:

- Normal video: `paused=false`, `muted=true`, duration **20.8s**,
  **6.8007 → 7.8127 → 8.8211 → 9.8290s**.
- Animated media: `paused=false`, `muted=true`, duration **2.466s**,
  **1.0003 → 2.0093 → 0.5244 → 1.5384s**, including the loop wrap.
- Image: actual duck image decoded at **352px and 640px**; no video/audio elements.
- Text: actual AMA body/proof/updates rendered; no video/audio elements.

For each direct sample the host source attribution and exact original URL remain
outside the provider frame. Play was explicitly pressed only after collecting the
before samples. Every inspected rendered WebKit provider sample denied parent DOM
access. The recorder also verifies revocation removes the full frame/action.

Chromium has zero accessible media because Reddit blocks its content. This is
**not successful no-autoplay or intentional-playback verification**. It remains
independently recorded, not substituted with a mock.
Firefox was attempted independently by the media suite and live recorder. It exits
before navigation with `Could not find profile folder`; no macOS security setting
was changed. The earlier QA report's additional installation attempts are historical
context, not newly executed Firefox acceptance.

Legacy adapter: official widgets.js returned 200 and constructed summary URLs.
Chromium content returned 403. WebKit content returned 200 but was blocked by the
provider's `frame-ancestors` policy under the opaque ancestor. Neither legacy live
content nor legacy playback is verified. No absent media in a blocked frame is
counted as success. Safe original links remain; deterministic adapter security and
content-free construction tests pass independently.

Chromium logs the provider 403. Each WebKit direct case logged six provider warnings/
errors, including `bad URL`, stylesheet CSP refusal and a reporting-beacon failure.
Legacy WebKit logs provider `frame-ancestors` refusals. These are retained in
`live-results.json`; errors were not suppressed and no host CSP exception was added.

## 4. Compatibility and explicit conflict

All valid full URLs and revalidated short links retain inline Reddit support.
Normal/GIF-labelled videos remain uninstantiated before Play. Image and text posts
retain automatic **title/attribution/action summaries** after consent, and actual
full inline images/body text after the same view action. Unsupported URLs, failed
identity resolution, restricted/deleted/unavailable posts retain clear original-link
fallbacks. Their availability is provider-controlled.

**Limitation:** automatic full still-image and full text-body rendering is no longer
provided for Reddit. The supported content-free option suppresses those as well as
videos/GIFs. The existing post type and oEmbed rich markup cannot securely classify
which full-content frame is safe to load automatically. This is the exact conflict
between preserving automatic full Reddit content and strict no-autoplay. Do not
mark MQ-001 fully accepted if that automatic-content behavior is required without
this fail-closed tradeoff. A supported reliable classification/control mechanism or
explicit product decision would be needed; neither is silently assumed here.

No other provider layout or session-consent rule is redesigned. Provider controls
are displayed as supplied by Reddit. The existing fixed 620px area is retained,
with a separate 44px-minimum host action below the summary; provider scrolling
remains available. This can leave empty reserved space in a short summary.

## 5. MQ-002 privacy wording

`src/pages/privacy.astro` now describes cross-origin direct frames, Reddit-origin
same-origin permission, the legacy opaque adapter, summaries, explicit full-content
activation, the image/body-text tradeoff and possible immediate playback after Play.
It describes other players' no-autoplay requests without a blanket playback guarantee.

Session-wide allow/decline, sessionStorage, new/unavailable storage behavior,
lazy loading, provider/partner requests and revocation limits remain disclosed.
Legal disclaimer, operator/California/US placeholders, contact configuration and
copyright/removal information remain unchanged. No identity or legal guarantee was
invented. Four rendered-browser assertions cover the corrected disclosure.

## 6. MQ-003 deterministic geometry correction

Opening footer settings scrolls. The test now explicitly positions the viewport
before allowing, waits for animation-frame observations and measures the target
media area beyond the real **320px** loading margin. It checks that allow/focus
restoration preserves that geometry and that the iframe remains absent.

Earlier players can change heights as they load. Positioning into view therefore
uses current bounds until the target is visible, checks it lies within the loading
margin, then waits for the actual iframe and verifies a single deferred instance.
This retains both the no-load and eventual-load requirements. The no-observer
fallback also explicitly starts at the top. No timing-only sleep replaces the test.

Three consecutive final runs (`media-suite-3.log`, `-4.log`, `-5.log`) passed
**176 assertions per engine** in Chromium and WebKit. The first development run
exposed intervening portrait-height shifts; the second exposed an activation-frame
navigation race. Current geometry positioning and waiting for the activated URL's
load resolve both; failed iterations remain recorded. Firefox is not a pass.

## 7. Regression execution

Counts overlap and must not be summed. All commands below are fresh, credential-free
local executions; Worker builds are dry runs. Command records/logs are retained
under `output/playwright/media-fix-002/`.

| Command/scenario                                                      | Result                                                                                                    |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                              | PASS; 395 packages, zero reported vulnerabilities                                                         |
| `npm run validate`                                                    | PASS: typecheck, lint, format; 89 unit/automation tests; one build smoke; 41 real local Worker/D1 entries |
| `npm run build`                                                       | PASS: static frontend and Worker dry-run bundle                                                           |
| `node --test tests/regression-001.mjs`                                | PASS, 6 entries after creating its required ignored evidence directory                                    |
| `node --test tests/release-qa.mjs`                                    | PASS, 5 entries                                                                                           |
| `node --test automation/tests/*.test.ts` (both expanded files)        | PASS, 56 tests                                                                                            |
| `WAAGD_BROWSER_TESTS=1 node --test tests/backend.integration.test.ts` | PASS, 42 entries, actual D1/API/frontend, direct/legacy Reddit security and 69 legal/privacy checks       |
| `WAAGD_BROWSER_TESTS=1 node --test tests/regression-001.mjs`          | PASS, 7 entries including host CSP attacks                                                                |
| Frontend browser suite against Astro development server               | PASS, 35 checks                                                                                           |
| Legal/privacy browser suite against built local Worker                | PASS, 69 checks                                                                                           |
| Media UX browser suite, repeated three times                          | PASS, 176 per available engine each run; Chromium/WebKit                                                  |
| Live Reddit acceptance                                                | WebKit direct cases as above; Chromium/Firefox/legacy explicitly NOT VERIFIED                             |

Initial validation hit downloaded/scratch observer JavaScript included by the
repository's lint traversal. Moved scratch scripts to the existing ignored `work/`
area, retained downloaded provider source as inert `.txt`, and formatted JSON
observations; no lint/test policy was changed. Final validation passes.
The first standalone regression run lacked `output/regression-001/`; creating that
existing suite's evidence directory made its unchanged tests pass.
The first frontend run used production assets and failed at the development-only
`?demo=1` check. Retested with the intended Astro dev server; all 35 checks pass.
Backend browser integration separately verifies production frontend behavior.

Security regression covers headers, exact provider identities, opaque/direct
parent isolation, malicious provider markup rejection, host/adapter CSP, original
links, authentication, SQL/D1 integrity and bounded DNS/SSRF behavior. The media suite
covers one session dialog, storage allow/decline, fresh sessions, no pre-consent
requests, lazy loading, keyboard/focus, revocation, pending resolution, same-ID
resolution validation, repeated scrolling and restored-page preferences.
New cases also reject untrusted scripted activation and reset playback on reallow.
No genuine private/author-deleted content sample or restored native BFCache is claimed.

## 8. Exact changed files

- `src/lib/presentation.ts`
- `src/lib/render.ts`
- `src/pages/privacy.astro`
- `src/styles/global.css`
- `worker/reddit.ts`
- `tests/media.test.ts`
- `tests/media.browser.mjs`
- `tests/media-ux-001.browser.mjs`
- `tests/media-fix-002.live.mjs` (new real-provider recorder)
- `tests/legal.browser.mjs`
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/deployment.md`
- `docs/media-fix-002-handoff.md` (this file)

## 9. Independent QA instructions and remaining acceptance

1. Check out `fix/media-qa-001` at the delivered commit. Read the unchanged QA report
   and this handoff. Run `npm ci`, validation and build. Create ignored
   `output/regression-001/` before its standalone suite. Use fresh local D1/test
   credentials; do not access production/staging.
2. Start the built local Worker using local bindings. Restart after any rebuild.
   Set `WAAGD_FRONTEND_BASE` to its origin and `WAAGD_PLAYWRIGHT_MODULE` to a matching
   external Playwright installation. No app dependency change is needed.
3. Run `node tests/media-fix-002.live.mjs`. Separately evaluate `j1bvtv` and `7qn3db`.
   Before Play require actual visible provider summary and no post media. Inspect
   HTMLMediaElement paused/time/muted samples using browser tools only. After trusted
   Play require actual playback and increasing/wrapping position, rather than HTTP
   200 or iframe load. Retain provider headers, visibility, attribution, exact original
   link and errors. A 403/unrendered 200 remains NOT VERIFIED.
4. Verify full `crpjwk` image and `z1c9z` body after activation, including original
   provider controls. Explicitly assess the automatic full-content tradeoff above;
   do not call it preserved automatic image/body-text rendering.
5. Run the media suite repeatedly in each working engine. Require measured
   before/after geometry and deferred loading, session keyboard/focus checks,
   revocation during resolution and reallow without restored playback activation.
6. Run backend browser/security/legal suites with an isolated Chromium CLI session.
   Use Astro dev for the standalone frontend suite's development-only demo check.
   Recheck that direct and opaque frames retain their distinct sandbox policies.
7. Independently obtain a working Firefox engine and assess all cases. Also assess
   native Safari/mobile/browser-restoration behavior if release acceptance requires
   them. Do not change system security settings or bypass provider restrictions.

MQ-002/MQ-003 are ready to reaccept. MQ-001's tested WebKit pre-Play boundary is ready
for independent challenge, while the complete acceptance finding remains open until
compatibility and missing browser evidence are resolved. Existing launch/legal/
staging prerequisites remain; this handoff supplies no promotion authorization.
