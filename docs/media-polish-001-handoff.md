# MEDIA-POLISH-001 — Compact Reddit summary

Date: **15 October 2026, Asia/Bangkok**. Branch: `fix/reddit-compact`.
Baseline: `qa/media-fix-002`, `f024e9427553b1f361a56430a29c781d693fdb52`.
Implementation commit: **`2c9328a5e7b6a4ebc36fa0b9982ceac06caa7165`**.
The following documentation commit adds this handoff and representative screenshots.

The owner's request explicitly approves the existing official summary plus deliberate
activation model. Earlier QA documents are historical reference material, including
their earlier unresolved product decision; they do not override that approval.

## Result

Collapsed Reddit media now occupies **300px**, including its 44px native activation
button. The official content-free iframe receives **254px**, replacing its previous
574px reservation. For the approximately 240px summary in the supplied observation,
unused iframe space falls from approximately 334px to 14px: **320px reclaimed**.

Trusted mouse, Enter or Space activation adds `reddit-expanded`, restores the existing
**620px** container, removes `showmedia=false`, removes the host activation button,
and focuses the iframe with `preventScroll`. Its full-content iframe is **618px**.
Revocation removes the frame and expansion class. Reallowing starts with the compact
content-free summary again, including after an earlier activation.

The existing iframe retains native document scrolling. No provider document is
resized, restyled, masked or modified. No cross-origin measurement, provider message
listener, injected provider script, timer, height animation or automatic activation
was added to application code. Existing session consent, viewport loading, resolver
generation checks, allow policy, sandbox, CSP, source links and fallback remain.

## Actual dimensions

Values below are CSS pixels measured from host container/iframe bounds. The same
dimensions passed in Chromium 155.0.8059.12 and WebKit 26.6 with deterministic text,
image, normal-video, GIF-labelled-video, long-summary and 403 documents at every
width: **72 cases**. Four actual Reddit posts also passed both host geometry states
at all six widths in WebKit. Iframe widths are container width minus its two borders.

| Viewport | Container width | Collapsed container | Summary iframe | Expanded container | Full iframe |
| -------- | --------------- | ------------------- | -------------- | ------------------ | ----------- |
| 320      | 284             | 300                 | 282 × 254      | 620                | 282 × 618   |
| 375      | 339             | 300                 | 337 × 254      | 620                | 337 × 618   |
| 390      | 354             | 300                 | 352 × 254      | 620                | 352 × 618   |
| 768      | 348             | 300                 | 346 × 254      | 620                | 346 × 618   |
| 1024     | 444             | 300                 | 442 × 254      | 620                | 442 × 618   |
| 1440     | 570             | 300                 | 568 × 254      | 620                | 568 × 618   |

No horizontal page overflow occurred. Keyboard activation preserved page scroll
and the media container's top within 1px in the deterministic matrix. The live
390px keyboard checks recorded no activation scroll movement. The intentional
320px expansion moves following feed content down; there is no height change when
the summary loads into its already reserved compact space.

## Screenshots

These unmodified browser captures are committed with the handoff:

| Evidence                                                                        | Screenshot                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Actual official summary, 390px                                                  | [Collapsed text](media-polish-001/reddit-390-collapsed.png)                     |
| Actual full post after activation, 390px                                        | [Expanded image](media-polish-001/reddit-390-expanded.png)                      |
| Actual long image-post title and provider footer at 320px                       | [Narrow summary](media-polish-001/reddit-320-collapsed.png)                     |
| Actual official summary, 1440px                                                 | [Collapsed video](media-polish-001/reddit-1440-collapsed.png)                   |
| Actual GIF-labelled MP4 after activation, 1440px                                | [Expanded GIF](media-polish-001/reddit-1440-expanded.png)                       |
| Oversized deterministic summary scrolled to its keyboard-focused control, 320px | [Long-summary controls](media-polish-001/fixture-320-long-summary-controls.png) |
| Actual AMA after provider Read more, scrolled to its last update/footer, 1440px | [Full-body controls](media-polish-001/reddit-1440-long-body-controls.png)       |

Full six-width screenshots, fixture results, provider responses/media samples and
command logs remain locally under `output/playwright/media-polish-001/`,
`output/playwright/media-fix-002/`, `output/playwright/media-ux-001/`,
`output/regression-001/` and `output/release-qa/`. These output directories are
Git-ignored. `compact-results.json`, `live-matrix.json` and `live-controls.json`
hold the new matrix evidence; command metadata uses the distinct final-run names.

## Verification

Node **24.15.0**, npm **11.12.1**; locked dependencies installed with `npm ci`
(395 packages added, audit reported zero vulnerabilities). All existing assertions
are unchanged. No existing test file was edited.

| Command                                                                    | Result                                                                                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`                                                                   | PASS                                                                                                                                                   |
| `npm run validate`                                                         | PASS twice; final run includes typecheck, lint, formatting, 89 unit/automation tests, 1 build smoke and 41 local backend entries                       |
| `npm run build`                                                            | PASS; static build and Worker dry run only                                                                                                             |
| `node --test tests/regression-001.mjs`                                     | PASS, 6 entries                                                                                                                                        |
| `node --test tests/release-qa.mjs`                                         | PASS, 5 entries                                                                                                                                        |
| `node --test automation/tests/*.test.ts`                                   | PASS, 56 tests                                                                                                                                         |
| `WAAGD_BROWSER_TESTS=1 node --test tests/backend.integration.test.ts`      | PASS, 42 entries; complete integrated API/frontend, pagination, permalink, deletion, Reddit/legacy isolation (32 checks) and legal browser checks (69) |
| `WAAGD_BROWSER_TESTS=1 node --test tests/regression-001.mjs`               | PASS, 7 entries, including 19 browser provider/CSP checks                                                                                              |
| `WAAGD_LIVE_REDDIT=1 node --test tests/release-qa.mjs`                     | PASS, 6 entries; live provider outcomes recorded separately from host assertions                                                                       |
| `node tests/frontend.browser.mjs` against Astro development server         | PASS, 35 checks                                                                                                                                        |
| `node tests/media-ux-001.browser.mjs`                                      | PASS, 176 checks each in Chromium/WebKit; Firefox launch NOT VERIFIED                                                                                  |
| `node tests/media-fix-002.live.mjs`                                        | Exit 0; all four direct WebKit summaries and activated posts rendered; zero pre-activation video/audio in four samples per post                        |
| `node tests/media-ux-001.live.mjs`                                         | Exit 0; complete existing live provider observations recorded; provider restrictions remain separate from acceptance                                   |
| `node tests/media-polish-001.browser.mjs`                                  | PASS, 36 cases each in Chromium/WebKit; Firefox launch NOT VERIFIED                                                                                    |
| Supplemental live WebKit geometry and actual AMA Read more/controls checks | PASS at all six widths; 48 collapsed/expanded records plus 6 expanded-body control observations                                                        |

Local browser origin: `http://127.0.0.1:8797`; Astro development origin:
`http://127.0.0.1:4325`. Browser tooling module:
`/Users/mikemmagik/.npm/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs`.
Existing CLI-driven suites used separate task-owned Chromium sessions. Temporary
test state and placeholder credentials were isolated from existing project data.

Initial setup attempts are retained: the legacy regression script expected the
ignored `output/regression-001/` directory to exist, which was created before its
successful runs. A build refresh invalidated the local Worker's asset manifest and
produced empty 404 pages in preliminary browser runs. Restarting the local server
after the final build resolved this. New test development also exposed navigation
timing and macOS WebKit link-Tab assumptions; the new suite waits for full-frame
navigation and verifies the keyboard-focused provider button. Existing assertions
were not changed to accommodate any failure.

## Provider observations and remaining limits

- Actual WebKit `z1c9z` text, `crpjwk` image, `j1bvtv` video and `7qn3db`
  GIF-labelled video summaries rendered official attribution and controls. Their
  summaries contained no video/audio before activation. After activation full
  text/image/media became available. The GIF MP4 advanced and looped. In the
  existing normal-video run its decoded 20.8-second video remained paused at 0;
  automatic post-activation playback is provider-controlled, not guaranteed.
- Actual AMA Read more expanded the body. Native provider scrolling and keyboard
  focus reached the comment footer at all six widths. The 320px long-summary
  fixture likewise retains scroll access to its footer. Reddit's own title
  ellipsis and responsive controls remain its responsibility; host code does not
  truncate provider content or remove controls.
- Chromium's real Reddit frames returned 403, as in the baseline. Its deterministic
  geometry/security/403 recovery coverage passes; live Reddit rendering and
  playback in Chromium remain NOT VERIFIED. Host attribution and original/recovery
  links remain available independently of provider success or iframe error events.
- Installed Firefox build 1553 cannot start: “Could not find profile folder.” No
  sandbox/security setting was changed. Firefox rendering remains NOT VERIFIED.
- The legacy opaque adapter retains its existing provider restrictions. Its live
  content is NOT VERIFIED; deterministic content-selection/isolation checks pass.
- This is local automated-browser verification. Physical devices, native Safari,
  assistive technology, arbitrary/future provider markup and deployed behavior
  were not verified. The fixed summary budget avoids unsupported provider sizing;
  unusually tall provider documents use native iframe scrolling.

## Changed files and scope

- `src/styles/global.css`: compact 300px default and explicit 620px expanded state.
- `src/lib/render.ts`: set expansion on trusted activation; reset it on revocation.
- `src/README.md`: document summary sizing, activation and playback boundary.
- `tests/media-polish-001.browser.mjs`: six-width state/keyboard/scroll/fallback regression.
- `docs/media-polish-001-handoff.md` and `docs/media-polish-001/*.png`: this handoff and seven screenshots.

No API, shared contract, D1 schema, existing persistent D1 data, CSP, sandbox,
staging, Telegram or OpenClaw changes. Required backend tests used fresh temporary
local databases. No deployment, push or merge occurred. The branch remains
`fix/reddit-compact`; main and staging were not changed.

To reproduce: install dependencies, build, then start an isolated local Worker
with this checkout's static assets. Run the new browser suite with
`WAAGD_FRONTEND_BASE` set to that local origin and `WAAGD_PLAYWRIGHT_MODULE` set
to the matching installed Playwright module. Restart the local Worker if a later
build replaces its watched asset directory. The supplemental scripts are retained
under ignored `work/media-polish-001/` for local inspection.
