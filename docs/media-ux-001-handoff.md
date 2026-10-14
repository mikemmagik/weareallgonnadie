# MEDIA-UX-001 handoff

Date: October 14, 2026 (Asia/Bangkok). Branch: `fix/media-ux-001`.
Baseline: `v0.1.0-rc.1`, `6e59767116a8b72f33d888d6677937fa2bef3c3c`.

Session consent, viewport loading and provider-specific layouts are implemented.
Reddit's confirmed WebKit application failures are corrected for full post URLs.
Live Firefox acceptance remains **NOT VERIFIED** because the installed browser
cannot launch in this environment. This is not unconditional cross-browser release
acceptance. No staging, deployment, merge, remote data, secrets, DNS, OpenClaw or
Telegram changes were made.

## Reddit investigation and correction

The baseline was reproduced before application edits, using built assets and the
local Worker. Only publication API responses were deterministic fixtures; Reddit
requests were real, without interception, credentials, network changes or bypasses.
The public image post `crpjwk` is Reddit's own documentation example. Evidence is
under ignored `output/playwright/media-ux-001/` (`baseline.json`, screenshots,
`direct-probe.json`, `direct-origin-probe.json`, and `live-results.json`). JSON
contains response headers/statuses, console errors, failed requests and frame text.

At 390px, TikTok and Instagram both measured **352 × 264px**, `aspect-ratio: 4 / 3`
with `max-height: 440px`. Reddit's outer frame had `allow-scripts allow-popups` and
an opaque CSP sandbox; widgets.js returned 200 and constructed a nested provider
iframe. Chromium's content response was **403**, with the visible network-security
block message. That is a provider restriction, not evidence of an application CSP,
CORS or successful playback result.

WebKit's nested content returned **200**, but Reddit's response includes
`frame-ancestors * chrome-extension://*`. WebKit rejected the opaque adapter ancestor
and showed an empty content area. Moving the official widget-generated iframe URL
directly into the host, still with an opaque sandbox, exposed a second failure:
**Origin null CORS rejection** on Reddit module resources and unhandled module
loading promises. Enabling the remote frame's own Reddit origin eliminated both
failures; the actual public post and its image rendered. There was no need to
relax the adapter CSP, proxy scripts, inject untrusted HTML, scrape/rehost media or
create another hosting origin. Storage/cookie permissions did not independently
establish a failure in these probes; no browser privacy settings were disabled.

Full URLs now construct the **current official widget-generated embed.reddit.com
iframe URL**, rather than the legacy redditmedia URL or a guessed media asset.
The remote frame uses `allow-scripts allow-same-origin allow-popups`, with no top
navigation, popup escape or fullscreen privileges. Here same-origin means the
validated **Reddit origin**, never the application's origin. SOP prevents parent
DOM access; deterministic and live probes confirm that denial. Main CSP adds only
that exact HTTPS frame origin. No Reddit script runs in the host. The legacy HTML
adapter retains its original **opaque** sandbox/CSP and independent security tests.

`redd.it` requires canonical subreddit identity. After consent and viewport entry,
the frontend requests the existing adapter with `resolve=1`. This GET-only mode
returns inert JSON containing only the validated same-ID full URL or null. The
existing fixed-host official oEmbed fetch remains redirect-free, five-second and
64 KiB bounded. The frontend revalidates provider/path/ID before creating a remote
frame and invalidates pending resolution on revocation. No write API, public Post
schema, authentication or D1 change was needed. Live short-link oEmbed resolution
returned no usable URL here, so an explicit unavailable message and original link
remain; deterministic resolution, mismatched identity and in-flight revocation pass.

Every eligible embed permanently retains its publication title, source attribution,
original safe link and a separate explanation that it may be blocked, unavailable,
deleted or restricted. These never depend on iframe load/error as success signals.
Unsupported URL/ID shapes keep a plain source fallback. Cross-origin provider errors
cannot reliably be detected by the host, so a visible recovery path is always present.

## Browser and real-provider evidence

Host: macOS **27.0.1**, Apple arm64; Node **24.15.0**, npm **11.12.1**.
Playwright supplied the real Chromium and WebKit engines; this is not a Safari app
or physical-device certification.

| Engine                           | Deterministic media suite | Live Reddit full posts                                                          | Other live observations                                                   |
| -------------------------------- | ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Chromium 155.0.8059.12           | PASS, 162 checks          | Image and AMA: provider 403; fallback visible                                   | Official TikTok video player and historical Instagram regular post render |
| WebKit 26.6, build 2368          | PASS, 162 checks          | Image `crpjwk` and text AMA `z1c9z`: 200, actual content visible; image visible | TikTok player and Instagram regular post render                           |
| Firefox target 156.0, build 1553 | **NOT VERIFIED**          | **NOT VERIFIED**                                                                | Browser exits with “Could not find profile folder” before page loading    |
| Native Safari / physical devices | **NOT VERIFIED**          | **NOT VERIFIED**                                                                | See manual checks below                                                   |

Firefox was installed and attempted headless with default and project-local temporary
profiles, and with a dedicated persistent headed profile. Headless attempts failed;
the headed launch did not become controllable and was stopped. No successful Firefox
page result is fabricated. Browser launch failure logs are retained in the JSON files.

Live runs use Reddit's documented image example and the public Barack Obama AMA,
TikTok's official player documentation example `6718335390845095173`, and Instagram's
historical oEmbed example `/p/fA9uwTtkSN/`. The local API supplies these source URLs;
provider responses are untouched. Before consent, provider requests were zero.
Screenshots at 390px and 1440px were captured. Reviewed mobile screenshots show the
actual Reddit image/attribution/actions, TikTok play/volume/progress/fullscreen controls,
and Instagram media/footer/actions inside their frames, with original links outside.
A provider HTTP 200 alone is not a render/playback assertion.

Provider diagnostics remain recorded: Chromium Reddit network restriction, WebKit
provider style/bad-URL warnings, TikTok provider telemetry/SDK failures, and unsupported
provider Permissions Policy warnings. They were not suppressed or worked around.
The iframe origin/host-access probes returned blocked access. Reddit image/text posts
are not playable video tests. Instagram's video element remained paused at time zero
with autoplay false and readyState zero. TikTok's visible poster/play controls showed
no automatic playback; its internal playback state was not exposed by this recorder.
**Successful playback and provider video no-autoplay are not fully certified.**
Live TikTok photo posts and Instagram Reel/carousel examples remain **NOT VERIFIED**;
fixture layouts are reported separately. No current eligible examples were supplied,
and ingestion's existing TikTok video identity contract was deliberately preserved.

Official documentation reviewed/attempted on the task date:

- [Reddit embedding help](https://support.reddithelp.com/hc/en-us/articles/360043033532-How-do-I-embed-a-Reddit-post-or-comment-in-an-article-or-other-publication), including its linked [official embed documentation](https://publish.reddit.com/assets/Reddit_Embed_Documentation.pdf).
- [Reddit embed terms](https://redditinc.com/policies/embeds-terms); provider branding/controls are not altered or hidden.
- [TikTok player documentation](https://developers.tiktok.com/docs/en/embed-player), updated August 4, 2026: official player URL, autoplay default/option, controls default and image-post support. No undocumented options/messages were introduced.
- [Meta oEmbed documentation](https://developers.facebook.com/docs/instagram-platform/oembed/) and [Instagram embed help](https://help.instagram.com/620154495870484) were attempted but returned 429/unavailable; the Facebook help alias redirected to login. Their current contents could not be verified. Existing provider iframe behavior was preserved and exercised live, without introducing a new Meta API/SDK integration.

## Session consent and privacy

The requested exact heading/body/actions appear in one native `<dialog>`, separate
from the unchanged permanent homepage disclaimer. The first eligible external-media
card opens it when no known session preference exists. Information-only pages do
not automatically prompt, but expose the same footer settings control.

Allow and decline use `sessionStorage['waagd.external-content']`; no localStorage,
persistent consent cookie, database choice or SDK. Reload/navigation retain the tab
session choice. Independent page sessions ask again. Browsers may copy state when
cloning tabs or restoring sessions; sessionStorage is not a promise that every window
operation destroys state. If storage reads fail or state is unknown, no permission is
assumed. If writes fail, an explicit choice applies to the current document only;
the dialog explains the limitation and subsequent documents ask again.

The native modal makes background content inert. Labels/descriptions, explicit focus
placement, Tab/Shift+Tab cycling and Escape-as-decline are implemented. Settings
explicitly focus their trigger for Safari pointer behavior and restore focus afterward.
Declining removes existing external images/frames, invalidates pending short-link
resolution and prevents later automatic loading. It cannot undo completed requests
or remove provider cookies. Restored documents recheck session state on persisted
pageshow. `/privacy` describes this, provider requests/cookies and storage duration;
it makes no universal legal-compliance claim.

Allowed media loads only when within the 320px IntersectionObserver margin. A
scroll/resize fallback preserves viewport gating without IntersectionObserver.
Registered nodes load once and existing feed nodes survive sorting/pagination.
No per-post consent control or extra embed preview request remains. First-party
images retain normal loading; unsafe preview/source validation is unchanged.

## Provider dimensions

TikTok uses a **9:16** player, width 100% up to **400px**, without the shared 440px
height cap. The official player retains its default visible controls and autoplay=0;
iframe/HTTP policies also deny autoplay. Live video controls fit without internal
scrolling at the observed widths. Deterministic image-post/player controls are covered;
this does not add photo URL ingestion to the existing shared video identity rules.

Instagram `/p/` uses its own layout; `/reel/` and legacy `/tv/` use the taller layout.
Both cap width at **540px**. Container-relative heights reserve portrait media and
180px for header/footer: posts use max(540px, 125% of width + 180px), Reels use
max(640px, 177.78% of width + 180px). Controls are not scaled, hidden or manipulated.
Regular posts and carousels share /p/ URLs, so their type cannot be reliably inferred
from the current metadata. There is no supported height-reporting protocol in this
integration. Provider scrolling remains available for longer captions/unusual ratios;
the host cannot guarantee exact height for every cross-origin post. The common live
post's media/footer fits, while original links always remain available outside.

## Security review

- Host scripts/styles/connections remain same-origin; no inline/eval or provider-script exception. Only the fixed Reddit frame origin is added, in aligned static/Worker CSP.
- Remote Reddit frames are isolated by SOP and sandbox; host/legacy-adapter opaque sandbox is never granted same-origin privileges. Camera, microphone, autoplay, clipboard and fullscreen remain denied for Reddit.
- Legacy adapter nonce/fixed-widget-script policy, deny arbitrary scripts/frames, opaque origin and autoplay assertions remain exercised. Direct provider host-access denial is tested separately.
- Provider source construction and ID/path/host matching remain mandatory. Short-link returned markup is discarded and resolved IDs rechecked. No arbitrary script proxy, provider bypass or media rehosting.
- Source links keep noopener/noreferrer. Preview HTTPS/private-target checks, automation SSRF/DNS/address-pinning/redirect/deadline tests, authentication and storage behavior remain intact.
- No changes to migrations, tokens, accounts, analytics, operator information or the legal disclaimer. Existing post-consent browser image DNS/redirect limitation remains.

## Executed tests and evidence

| Command / scenario                              | Result                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                        | PASS                                                                                                                                |
| `npm run validate`                              | PASS: zero type errors/warnings; lint/format; 88 unit/backend/automation tests, 1 build smoke, 41 real local Worker/D1 tests        |
| `npm run build`                                 | PASS: Astro static output and Wrangler **dry-run only**                                                                             |
| `node --test tests/regression-001.mjs`          | PASS: 6 tests                                                                                                                       |
| `node --test tests/release-qa.mjs`              | PASS: 5 tests                                                                                                                       |
| Integrated backend with `WAAGD_BROWSER_TESTS=1` | PASS: 42 tests, including frontend/permalinks/pagination, Reddit direct/legacy isolation and legal suite (65 browser checks)        |
| `node tests/media-ux-001.browser.mjs`           | PASS: 162 checks each in Chromium/WebKit; Firefox NOT VERIFIED                                                                      |
| `node tests/media-ux-001.live.mjs`              | Recorded real-provider observations in Chromium/WebKit; Firefox launch unavailable; observation completion does not assert playback |

The retained independent suite with `WAAGD_BROWSER_TESTS=1` also passed all 7
tests, including host CSP attack probes. The development frontend suite on this
checkout's actual Astro port 4323 passed all 35 browser checks.

The new media suite covers first visit, keyboard/modal behavior, Escape/decline,
accept/reload, settings changes/revocation, independent session, unavailable storage,
no external resource creation before consent, viewport loading, pagination, duplicated
IDs, repeated scrolling, no autoplay, resolver identity rejection/in-flight revocation,
restored-page preference recheck, no-IntersectionObserver fallback, unsafe/broken
previews, unsupported/restricted/deleted/private Reddit fallbacks and CSP attacks.
Provider layouts/fixture controls/original links/page overflow are exercised at
**320, 375, 390, 768, 1024 and 1440px**. Fixtures prove application layout/security,
not live-provider playback. Existing frontend/legal/media/policy scripts were updated
for the explicitly approved session UX. Security assertions were retained, including
independent legacy adapter attack probes and the small client-script budget.

Initial test/setup failures were corrected and rerun: absent independent evidence
folder, obsolete per-item assertions, native focus cycling/return, and a fixture 404
whose image body was still decodable. Overlapping rebuilds invalidated a local asset
manifest; a fresh local server and sequential build/test phases restored normal
responses. The development-only demo requires the actual task-owned Astro port,
not the built Worker or another already-running checkout. These are not live-provider
success claims. Logs under the evidence directory contain the final command results.

## Independent QA instructions and remaining acceptance

1. On this branch run `npm ci`, `npm run validate`, `npm run build`. Keep builds finished before starting a local server. No deployment command is required; the build's Wrangler command is dry-run.
2. Start `npm run dev:worker -- --env-file /dev/null` (local-only). Run `npx --yes --package @playwright/cli playwright-cli --help` to populate the local tool cache, then `npx --yes --package playwright playwright install chromium firefox webkit`. No repository dependency change is needed. Run `node tests/media-ux-001.browser.mjs`. Set `WAAGD_FRONTEND_BASE` if using another port and `WAAGD_PLAYWRIGHT_MODULE` to an explicit installed `playwright/index.mjs` if your tool cache differs. NOT VERIFIED engine entries require follow-up; they are not passes.
3. Run `node tests/media-ux-001.live.mjs`; this mocks only local publication reads, leaves providers untouched and stores logs/screenshots. Do not treat recorder exit status or HTTP 200 as rendered media or playback proof.
4. For the retained development frontend suite, start this checkout's `npm run dev`, note its reported port, open a Playwright CLI session and run `WAAGD_BROWSER_SESSION=<session> WAAGD_FRONTEND_BASE=<actual-Astro-origin> node tests/frontend.browser.mjs`. For integrated suites use the built local Worker, with `WAAGD_BROWSER_TESTS=1` and the same CLI session. Create `output/regression-001` before running the retained independent suite.
5. On a machine where Firefox launches, run `WAAGD_BROWSERS=firefox node tests/media-ux-001.browser.mjs` and the live recorder. Also check current native Firefox and Safari in private/new tab sessions. Record exact versions/OS. Open Network and Console, clear sessionStorage for the first-visit case, navigate to a feed containing approved public examples, and verify zero provider/image requests before choosing. Check Tab/Shift+Tab/Escape, background inertness, accept/decline reloads, footer settings and independent sessions.
6. Use legitimate current public full Reddit image/text/video posts plus deleted/private/restricted and unsupported URLs. Check direct frame URL and sandbox, response status/headers, frame-ancestors/module errors, actual title/attribution/media and persistent original recovery links. A provider 403 must be reported separately. Verify redd.it canonical resolution where oEmbed permits it. Never disable browser protections or bypass provider restrictions.
7. Supply eligible TikTok video/photo posts and Instagram Reel/regular/carousel URLs under existing supported ingestion rules. At all six widths check the complete footer, play/volume/progress/fullscreen or carousel controls, provider internal scrolling and page overflow. Verify no playback before a deliberate play action, then verify intentional controls/playback. Inspect long captions and uncommon media ratios; scrolling may be necessary for Instagram.
8. Allow media, scroll/paginate repeatedly and count provider frame creation. Revoke while a short-link response is delayed, verify no late frame, then change settings on `/privacy` and use Back to confirm restored feed preference. Test disabled/quota-limited storage and browser session restore/tab-cloning behavior.

Remaining acceptance: Firefox/native-device verification, eligible live Reddit video
playback, TikTok image posts and Instagram Reels/carousels; exact Instagram height
for unusual content; legitimate provider restrictions/short-link oEmbed availability;
post-consent direct-image DNS/redirect exposure. No full privacy-law, edge/staging or
production-readiness certification is implied. Existing staging remains untouched.

## Changed files

- Frontend: `src/lib/external-content.ts`, `src/lib/render.ts`, `src/lib/presentation.ts`, `src/components/ExternalContent.astro`, `src/components/LegalLinks.astro`, `src/pages/index.astro`, `src/pages/privacy.astro`, `src/styles/global.css`.
- Provider response/security: `worker/reddit.ts`, `worker/security.ts`, `public/_headers`.
- Tests: `tests/media-ux-001.browser.mjs`, `tests/media-ux-001.live.mjs`, `tests/media.test.ts`, `tests/build.smoke.test.ts`, `tests/frontend.browser.mjs`, `tests/legal.browser.mjs`, `tests/media.browser.mjs`, `tests/mvp.browser.mjs`, `tests/regression-001.browser.mjs`, `tests/release-qa.browser.mjs`.
- Documentation: `README.md`, `src/README.md`, `docs/api.md`, `docs/architecture.md`, `docs/decisions.md`, `docs/deployment.md`, `docs/media-ux-001-handoff.md`.

The final commit SHA is supplied in the delivery message. Ignored evidence is local,
not part of the source commit; preserve it when handing this checkout to QA.
