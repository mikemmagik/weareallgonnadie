# MEDIA-FIX-003 — Firefox focus and consent stability

Date: **15 October 2026, Asia/Bangkok**. Branch: `fix/firefox-focus`.
Baseline: `qa/media-polish-001`, **48bb4c125c805dade246fef3aa21e88a5c01a6bc**.
The user's pasted MEDIA-FIX-003 request authorizes this remediation and local commit.
Earlier QA/handoff documents supply evidence, not deployment or push authority.

## Root cause and reproduction

Reproduced the committed MEDIA-QA-003 observation independently against the baseline
built application, using a single routed publication and a separate cross-origin
Reddit-shaped document. No ignored historical evidence script was assumed present.
Linux Firefox **157.0**, Playwright **1.64.0**, Ubuntu **24.04**, arm64, reproduces:
Enter and Space expand 300 → 620px but leave `document.activeElement` at BODY at load,
100ms and 500ms. The next native Tab reaches a host `source-link`; the provider
button remains unfocused. Mouse retains IFRAME focus and reaches its provider button.
Chromium/WebKit baseline probes retain iframe focus. Raw lifecycle evidence is in
`output/media-fix-003/baseline-firefox.json` and `baseline-focus.json`.

The old handler navigates the iframe, removes the currently focused button and calls
`frame.focus()` against a document being replaced. Firefox's keyboard path does not
retain that synchronous transfer, and no later lifecycle action restores it. Simply
moving `focus()` before navigation/removal, including explicit iframe tabindex=0,
also reproduces BODY focus. This is evidence for a navigation/focus ordering defect;
no claim about uninspected Gecko internals is needed.

## Exact application correction

`src/lib/render.ts` gives Reddit media a named group and uses that existing container
as a stable host focus anchor (`tabindex=-1`) **before** assigning the full-content URL
and removing Play. It occurs before the iframe in sequential navigation order. On
the replacement iframe's load, one listener transfers focus with `preventScroll`
only if the generation is current, the frame is connected, the document still has
focus and the visitor is still on that anchor. No retry loop or timer is used.
Moving elsewhere or opening settings prevents delayed focus reclamation. Revocation
invalidates the generation, removes the frame and removes the temporary tabindex.
`src/styles/global.css` gives the pending keyboard anchor the existing focus outline.

Load is only a navigation lifecycle boundary. It does not prove that Reddit rendered
successfully. HTTP 403 is exercised separately and retains recovery links. The host
never accesses provider DOM, changes provider controls or infers success from load.
The frame remains a single instance; full navigation still requires trusted activation.

While navigation is delayed, the labelled host group retains focus instead of BODY.
Native Tab enters the provider path. After load Firefox keeps IFRAME focus through
100ms/500ms and its next Tab reaches the fixture provider button. Mouse behaves the
same way. Delayed-load Tab, movement away, pending revocation, reallow/reload resets,
one full navigation, scroll/card-top preservation and unavailable content are tested.
The 100ms/500ms waits are observation samples in tests only.

## Consent/pagination diagnosis and correction

This was **an actual pointer interaction race plus an invalid automation assumption**,
not a consent bypass or evidence that the Allow handler failed. In a fresh Linux
Firefox reproduction of the unchanged Media UX suite, recorded browser events are:

1. pointerdown: Settings BUTTON, scrollY=3151, feed state `loading`.
2. Pagination appends cards while the pointer remains at viewport y=959.
3. pointerup: a newly inserted original-link A, feed state `end`.
4. click: the common page DIV, not Settings. The dialog never opens.
5. The test scrolls to the top and waits for an Allow button in the closed dialog.

The saved dialog lacks `open`, preference stays Decline and external resources stay
unloaded. Evidence: `output/media-fix-003/consent-before.json`, screenshot and trace.
This can affect a real pointer user when a layout update splits a click; waiting or
retrying the automation alone would not fix that gesture.

`src/lib/external-content.ts` now captures the primary pointer on Settings on down,
so the subsequent up/click belongs to the intended button if layout moves underneath
it. It still opens on **click**, never on pointerdown. A real pointermove outside the
button's original bounds releases capture, preserving drag-away cancellation.
Browser pointer cancellation releases capture normally; lost capture removes the
per-gesture listener with an AbortController. WebKit may still emit a click after
capture release, so a cancelled-pointer flag suppresses that pointer click only.
Keyboard activation (click detail=0) remains available even after cancellation.

The existing **176-assertion Media UX suite is unchanged**. The new test deliberately
holds a real pagination response, presses Settings, completes pagination between down
and up, verifies measured footer movement over 100px, then releases the pointer.
It requires a visible, focused, operable modal, zero requests while declined,
Allow → media loaded → Revoke → unloaded → reload still declined. Separate cases
exercise keyboard settings during pagination and deliberate drag-away cancellation.

## Test changes and reproducibility

- `tests/media-fix-003.browser.mjs`: three repeated Enter/Space/mouse passes at
  320/390/1440px (27 cases), 15 pending-navigation/intent/revocation/403 cases and
  three controlled consent/pagination cases: **45 cases per engine**. Browser launch
  failure is an error; Firefox acceptance explicitly requires Linux.
- `tests/media-polish-001.browser.mjs`: retains every existing assertion. The iframe
  focus assertion now waits for the full URL's **load** boundary; the new suite
  additionally checks focus during the pending interval. Host bounds now come
  directly from getBoundingClientRect() in the browser. Firefox's protocol can
  serialize 300px as 300.0000305175781 when subtracting distant coordinates. The
  original exact 300/620px and summary-height comparisons remain, without rounding
  or additional tolerance. Provider control bounds still use page coordinates.
- `tests/legal.browser.mjs`: retains exact before/after reserved-height equality,
  measured with in-page getBoundingClientRect(). Three independent Firefox probes
  record an actual unchanged 205px height while protocol boundingBox() changes
  205 → 204.99996948242188 after scrolling. No layout assertion is relaxed;
  evidence is in output/media-fix-003/legal-height-probe.json.
- `tests/media-fix-003.qa.mjs`: committed, self-contained QA runner. Serves built
  `dist/` on an ephemeral loopback port with the unchanged `public/_headers`, uses
  routed fixture APIs/provider documents, and runs focused tests, 36 compact cases,
  five independent Media UX executions and all 69 legal checks per selected engine.
  Checks JSON counts/status as well as process exits; a NOT VERIFIED launch cannot
  silently pass. It needs no ignored scripts, Cloudflare credentials or database.

macOS WebKit's default Tab policy differs from Firefox/Chromium. The focused suite
uses its native **Option-Tab** shortcut to enter the frame and reach fixture buttons.
Plain Tab in the default macOS mode can skip non-text controls, as observed in an
independent probe; this is not presented as plain-Tab button acceptance. No preference, system
security setting or provider DOM is modified. See [Apple's Safari shortcuts](https://support.apple.com/en-gb/guide/safari/cpsh003/mac).
Linux Firefox, Linux WebKit and Chromium use plain Tab throughout. Linux WebKit
27.2 independently passes all 45 focused cases, including actual plain-Tab access
to provider buttons; macOS WebKit 26.6 is recorded separately. These are automated engine
results, not fresh native Safari or assistive-technology acceptance.

## Actual test results

Tooling: macOS arm64, Node 24.15.0/npm 11.12.1, external Playwright
1.64.0-alpha-1790635538000; Linux arm64, Ubuntu 24.04.5, Node 24.21.0,
external Playwright 1.64.0. The Linux runtime is the standard
`mcr.microsoft.com/playwright:v1.64.0-noble` image, digest
`sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f`.
No browser launch security overrides or OS security changes were used.

| Engine / platform              | Focused             | Compact | Media UX     | Legal/privacy |
| ------------------------------ | ------------------- | ------- | ------------ | ------------- |
| Chromium 155.0.8059.12 / macOS | 45 PASS             | 36 PASS | 5 × 176 PASS | 69 PASS       |
| WebKit 26.6 / macOS            | 45 PASS, Option-Tab | 36 PASS | 5 × 176 PASS | 69 PASS       |
| Firefox 157.0 / Ubuntu 24.04.5 | 45 PASS, plain Tab  | 36 PASS | 5 × 176 PASS | 69 PASS       |
| WebKit 27.2 / Ubuntu 24.04.5   | 45 PASS, plain Tab  | 36 PASS | 5 × 176 PASS | 69 PASS       |

All 45-case runs use three repeats for each normal activation/width combination.
Five media runs use separate browser pages/contexts and retain all original 176
assertions. Chromium/macOS WebKit also pass the final in-page measurement versions
of the compact and legal suites separately after their complete run.

| Command (environment where needed)                                                                                                               | Result                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `npm ci`                                                                                                                                         | PASS; 395 packages, zero reported vulnerabilities                                         |
| `npm run validate`                                                                                                                               | PASS; typecheck/lint/format, 89 unit/automation tests, 1 build smoke, 41 local D1 entries |
| `npm run build`                                                                                                                                  | PASS; Astro static build and Worker dry-run bundle                                        |
| `node --test tests/regression-001.mjs`                                                                                                           | PASS; 6 entries                                                                           |
| `node --test tests/release-qa.mjs`                                                                                                               | PASS; 5 entries                                                                           |
| `node --test automation/tests/*.test.ts`                                                                                                         | PASS; both files expanded, 56 tests                                                       |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=mediafix003 node --test tests/backend.integration.test.ts`                                          | PASS; 42 entries, including actual D1/API/frontend and 32 Reddit + 69 legal checks        |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=mediafix003 node --test tests/regression-001.mjs`                                                   | PASS; 7 entries, including 19 provider/CSP assertions                                     |
| `WAAGD_LIVE_REDDIT=1 WAAGD_BROWSER_SESSION=mediafix003 node --test tests/release-qa.mjs`                                                         | PASS; 6 entries; live provider restrictions recorded separately                           |
| `WAAGD_FRONTEND_BASE=http://127.0.0.1:4327 WAAGD_BROWSER_SESSION=mediafix003 node tests/frontend.browser.mjs`                                    | PASS; 35 checks in a fresh browser session                                                |
| `WAAGD_PLAYWRIGHT_MODULE=<external macOS module> WAAGD_BROWSERS=chromium,webkit node tests/media-fix-003.qa.mjs`                                 | PASS; complete browser rows above                                                         |
| `WAAGD_PLAYWRIGHT_MODULE=/tmp/waagd-playwright/node_modules/playwright/index.mjs WAAGD_BROWSERS=firefox node tests/media-fix-003.qa.mjs` (Linux) | PASS; complete Firefox row above                                                          |
| `node --test tests/media.test.ts`                                                                                                                | PASS; 6 media/security tests                                                              |
| `WAAGD_BROWSERS=webkit node tests/media-fix-003.qa.mjs` (same external Linux module)                                                             | PASS; complete Linux WebKit row above                                                     |

Counts overlap and should not be summed. Exact command arrays, exit codes and
expanded automation arguments are retained in `output/media-fix-003/`, with logs
under its `logs/` directory and browser JSON/screenshots under
`output/playwright/media-fix-003/` and `output/playwright/media-polish-001/`.
The final build SHA-256 manifest exactly matches the browser-tested static files.
Built static fixtures run with the actual unchanged production CSP/permissions
headers; backend integration additionally checks actual local Worker headers/D1.
The optional release browser recorder observes Chromium Reddit 403 restrictions;
its passing harness is **not** a successful live playback/content verdict.

During investigation, preliminary runs failed on the original defects, protocol
geometry noise, a too-specific new fixture Tab expectation (native video controls
preceded its button), new-fixture locator ambiguity after automatic pagination,
WebKit drag cancellation, and rebuilding dist while a browser run was active.
These are retained as investigation results, not counted as final PASS. The final
runs use stable built assets; pointer cancellation is explicitly covered. CLI
frontend testing also required a fresh task-owned browser session to avoid earlier
suite navigation/init-script state. No failing behavioral assertion was waived.

## Security and scope

No provider validation, sandbox, allow policy, autoplay boundary, CSP, headers,
resolver, API contract, authentication, D1 schema or provider attribution changes.
Session consent remains mandatory; summaries stay lazy and content-free with
showmedia=false, collapsed 300px; trusted view/play expands to 620px. Images/text
retain the owner-approved activation requirement. Revoke/reload never resurrect
full-content activation. Existing malicious markup, opaque adapter, host/provider
isolation and arbitrary-script/frame CSP assertions remain required.

All Worker/D1 regression work uses disposable **local** state. No deployment,
staging access/change, remote D1, main merge, tag, DNS, Telegram/OpenClaw change,
push or remote workflow trigger was performed. The installed Docker Desktop Linux
runtime was started for local browser testing; no Docker configuration or dependency
was introduced into the repository.

## Actual changed files

- `src/lib/render.ts`
- `src/lib/external-content.ts`
- `src/styles/global.css`
- `tests/media-polish-001.browser.mjs`
- `tests/legal.browser.mjs`
- `tests/media-fix-003.browser.mjs` (new)
- `tests/media-fix-003.qa.mjs` (new)
- `docs/media-fix-003-handoff.md` (new)

Previous independent reports and `.github/workflows/media-firefox-qa.yml` are unchanged.

## Independent Linux QA instructions

Use Node 24/npm 11 and a fresh checkout of the delivered commit. Install browser
tooling externally, with matching browser builds; do not add it to package.json.
On an isolated Ubuntu 24.04 host:

```sh
npm ci
npm run validate
npm run build
npm install --prefix /tmp/waagd-playwright --no-save --package-lock=false --ignore-scripts playwright@1.64.0
node /tmp/waagd-playwright/node_modules/playwright/cli.js install --with-deps firefox
WAAGD_PLAYWRIGHT_MODULE=/tmp/waagd-playwright/node_modules/playwright/index.mjs WAAGD_BROWSERS=firefox node tests/media-fix-003.qa.mjs
```

Require exit 0, `firefox.json` with 45 passing cases, five 176-check media passes,
36 compact PASS records and 69 legal checks in `qa-firefox.json`. Retain
`output/playwright/media-fix-003/`, `output/playwright/media-polish-001/` and logs.
The runner starts/stops its own server and requires no staged/production service.
For separate Chromium/WebKit acceptance, install their matching engines and select
`WAAGD_BROWSERS=chromium,webkit`. Never build while a fixture browser run is active:
Astro replaces `dist/`, temporarily invalidating static pages/assets.

The original workflow only triggers for `qa/media-polish-001` and only when its own
file changes, with an additional exact-ref job guard. Pushing this fix would **not**
run it. No workflow change or push is needed for the local Linux acceptance above.
If separately authorized CI acceptance is desired, the exact proposed workflow
changes are: change `on.push.branches` to `[fix/firefox-focus]`; change the job guard
to `github.ref == 'refs/heads/fix/firefox-focus'`; retain existing read-only
permissions, pinned checkout/setup actions, Ubuntu/Node/browser installation and
artifact upload; replace generated ignored probes/Worker and their test steps with
`npm run build:frontend` followed by `timeout 600s node tests/media-fix-003.qa.mjs`
under the existing Firefox/module environment. Keep the workflow-path trigger for
an explicit authorized workflow-change push. Do not change main or add deployment
steps/secrets. These changes are **proposed only**, not applied or triggered.

## Remaining limitations

Deterministic cross-origin fixtures prove host lifecycle/navigation/security
behavior; they are not new real Reddit playback, availability or content evidence.
Provider restrictions, native Safari, physical mobile devices, assistive technology,
actual BFCache/browser UI Duplicate Tab and staging/production remain outside the
fresh evidence. No release/promotion conclusion is inferred from these local fixes.
The local Linux environment is arm64; independent Ubuntu amd64 CI remains useful
for architecture-specific confirmation. Delivery commit SHA is supplied separately
rather than embedding a self-referential SHA here.
