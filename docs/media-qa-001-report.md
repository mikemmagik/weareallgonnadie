# MEDIA-QA-001 — Independent Media UX Acceptance

**LOCAL ACCEPTANCE: FAIL. RESTRICTED STAGING: HOLD. PUBLIC PRODUCTION: NO-GO.**

Live Reddit video automatically plays in WebKit after session consent and viewport
entry, without a Play action. This violates the requested no-autoplay behavior.
The privacy page also incorrectly describes the new direct Reddit frame as opaque.
Firefox remains **NOT VERIFIED** after fresh installation and isolated-profile
attempts. Passing deterministic tests do not close these findings.

## 1. Audited revision and scope

Audited on **14 October 2026, Asia/Bangkok**, in
`/Users/mikemmagik/Documents/waagd-media-qa`, branch `qa/media-ux-001`.
Clean starting HEAD, `fix/media-ux-001` and `origin/qa/media-ux-001` were
**`78fe1607e52c4b59606c43e67451cf17c8290040`**. Compared its actual changes against
parent `6e59767116a8b72f33d888d6677937fa2bef3c3c`.

Read AGENTS.md, the media handoff, FINAL-QA-002 report, API, architecture and
deployment documentation. Reviewed the requested frontend, styles, Reddit adapter,
security headers, shared provider validation, privacy component, feed lifecycle and
relevant existing tests. Prior developer results were historical context only;
results below are fresh executions plus independent challenges.

The pasted task supplied the authorization. Repository documents were reference
material, not authorization for deployment or infrastructure changes. Application
code, existing tests, dependencies, lockfile, configuration and migrations were not
edited. Only this report is committed. Isolated fixtures, scripts, logs and
screenshots are retained under ignored `output/`. No staging/Cloudflare deployment,
DNS, main merge, existing D1 data, Telegram or OpenClaw operation occurred. No push
was requested or performed.

## 2. Environment and browser setup

macOS **27.0.1 (26A434), Apple arm64**, Node **24.15.0**, npm **11.12.1**,
Astro **7.3.8**, Wrangler **4.149.0**. Locked installation: 395 packages, zero
reported npm vulnerabilities. Tooling is separate from application dependencies.

Primary automation used cached Playwright **1.64.0-alpha-1790635538000** with its
matching Chromium/WebKit. The fresh Firefox retry used external cached Playwright
**1.64.0** and a separate browser installation in the ignored QA directory.
No application dependency was added.

| Browser / OS                                   | Fresh result                                                                                            | Limit                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chromium 155.0.8059.12, build 1247 / macOS     | 162 media assertions achieved; 20 independent browser assertions pass; live TikTok and Instagram render | Media suite has an intermittent false distance assertion; Reddit content frames return 403                                                                               |
| WebKit 26.6, build 2368 / macOS                | 162 media assertions and 20 independent browser assertions pass; live Reddit content renders            | **FAIL** real Reddit no-autoplay; this engine is not native Safari certification                                                                                         |
| Firefox target 156.0, build 1553 / macOS       | **NOT VERIFIED**                                                                                        | Exits before navigation: `Could not find profile folder`                                                                                                                 |
| Fresh Firefox target 157.0, build 1555 / macOS | **NOT VERIFIED**                                                                                        | Same headless failure; headed persistent launch times out with macOS sandbox/helper errors                                                                               |
| Native Safari 27.0.1, 22625.1.29.11.28 / macOS | Limited real-app smoke executed                                                                         | Consent/reload/settings/privacy link and live Reddit image pass; GIF-labelled MP4 visibly animates without Play; full browser suite/network diagnostics **NOT VERIFIED** |
| Native Firefox release application             | **NOT VERIFIED**                                                                                        | No standard Firefox app in `/Applications` or `~/Applications`; Firefox-derived Zen/Tor are not substituted                                                              |

Started with the Firefox CLI attempt, then independently tried default headless,
existing explicit project-local profile, canonical `/private/tmp` profile and headed
persistent profile. Retried with `TMPDIR=/private/tmp` established before importing
Playwright and a freshly downloaded official Firefox build. Verified profiles exist.
The new build reproduced the error; headed attempts failed or timed out with
`sandbox_extension_issue_file_to_process`/helper-process errors. Root cause within
macOS/browser startup is not proven. No app CSP, browser security, system privacy
permission or provider restriction was weakened to make it launch.

The CLI initially selected unavailable Google Chrome. An isolated CLI configuration
selected the installed Chromium engine, with the Chrome channel unset. The fresh
Firefox installer initially selected a different Playwright version; the retry
explicitly matched that package to its build 1555. These setup failures are retained,
not counted as browser passes. See `browser-setup.log`, `browser-setup-initial.json`,
`firefox-cli-initial.log`, `firefox-fresh-install.log` and
`browser-setup-fresh-corrected.json` in the evidence directory.

## 3. Executed commands and actual results

Working directory is the audited checkout. Most commands used the retained recorder:
`python3 output/playwright/media-qa-001/run.py <log-stem> <command...>`.
It removes inherited `CLOUDFLARE_*`/`CF_*` credentials, disables tool telemetry and
isolates tool configuration/cache/logs. JSON records expanded arguments, exit and
duration; matching `.log` files contain actual output. Counts overlap and must not
be summed.

| Command / scenario                                                                    | Actual result                                                                                                                                                             | Log stem                                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `npm ci`                                                                              | **PASS**, exit 0                                                                                                                                                          | `npm-ci`                                                         |
| `npm run validate`                                                                    | **PASS**, exit 0; typecheck, lint, format; 88 unit/automation tests, 1 build smoke, 41 local backend entries                                                              | `validate`                                                       |
| `npm run build`                                                                       | **PASS**, exit 0; static assets and Worker dry-run bundle; no deployment                                                                                                  | `build`                                                          |
| `node --test tests/regression-001.mjs`                                                | **PASS**, 6 entries                                                                                                                                                       | `regression`                                                     |
| `node --test tests/release-qa.mjs`                                                    | **PASS**, 5 entries                                                                                                                                                       | `release`                                                        |
| `node --test automation/tests/*.test.ts` (both actual files)                          | **PASS**, 56 tests                                                                                                                                                        | `automation-corrected`                                           |
| `WAAGD_BROWSER_TESTS=1 node --test tests/backend.integration.test.ts`                 | **PASS**, 42 entries; includes production frontend, actual API, pagination/permalinks, direct/legacy Reddit isolation and 65 legal/privacy browser checks                 | `backend-browser`                                                |
| `WAAGD_BROWSER_TESTS=1 node --test tests/regression-001.mjs`                          | **PASS**, 7 entries including host CSP attacks                                                                                                                            | `regression-browser`                                             |
| `WAAGD_FRONTEND_BASE=http://127.0.0.1:64875 node tests/frontend.browser.mjs`          | **PASS**, 35 browser checks                                                                                                                                               | `frontend-browser`                                               |
| `WAAGD_FRONTEND_BASE=http://127.0.0.1:64873 node tests/media-ux-001.browser.mjs`      | Initial exit 1: Chromium distance assertion fails; WebKit 162 pass; Firefox unavailable. Unchanged full rerun exit 0: Chromium/WebKit 162 each, Firefox still unavailable | `media-suite`, `media-suite-rerun`                               |
| Unchanged exported `verifyMediaUx` diagnostic runs                                    | One additional Chromium 162 pass; two further runs reproduce false distance assertion with card geometry recorded                                                         | `media-suite-diagnostic`, `suite-reliability`                    |
| `node output/playwright/media-qa-001/independent.mjs`                                 | **PASS**, 14 rejected provider/identity cases, 4 resolver markup cases, 20 assertions per available engine                                                                | `independent-final`                                              |
| `node tests/media-ux-001.live.mjs` with local base above                              | Observation completed, exit 0; not a blanket render/playback pass                                                                                                         | `live-media`                                                     |
| Independent extended live, normal-video live, playback and six-width layout recorders | Actual results in sections 5, 7 and 8; recorder completion is not acceptance                                                                                              | `extended-live`, `normal-video-live`, `playback`, `live-layouts` |
| `node output/playwright/media-qa-001/reddit-video.mjs` and `reddit-normal-video.mjs`  | Recorded **FAIL** behavior: automatic GIF/video playback in live WebKit                                                                                                   | `reddit-video`, `reddit-normal-video`                            |
| `node output/playwright/media-qa-001/bfcache.mjs`                                     | History navigation preserves decline; actual persisted BFCache restoration not observed                                                                                   | `bfcache`                                                        |

Backend tests create fresh temporary D1 state using the real migration, explicit
`--local`, sentinel IDs, `remote: false`, `remoteBindings: false`, disabled env-file
loading and disposable test tokens. They do not use or modify an existing database.
Local Worker at **64873** uses separate ignored state and `--env-file /dev/null`;
fixture API reads are intercepted. Astro at **64875** belongs to this checkout.
Native Safari proxies at **64874/64876** replace only publication API responses,
forward built assets/headers from the local Worker and leave provider traffic live.

All application builds finished before these servers were used. The initial
supplemental script had a relative import error, then a WebKit fixture transport
error (`Cannot fulfill with redirect status: 302`); corrected isolated fixtures were
rerun. An initial automation command named nonexistent files; both actual test files
were then executed successfully. No committed test or assertion was changed.

## 4. Reddit security assessment

**PASS for exercised isolation and URL boundaries; no confirmed sandbox escape or
host-script/CSP security regression.** No-autoplay is separately **FAIL** below.

- Full sources pass shared exact-host/path/post-ID parsing and metadata ID agreement.
  Frames are constructed as HTTPS `embed.reddit.com/r/.../comments/<id>/` URLs.
  Independent challenges reject lookalike hosts, userinfo, nonstandard ports,
  application URLs, JavaScript schemes, bad/encoded IDs and extra comment paths.
- Provider HTML never enters the host DOM. The renderer uses DOM construction and
  textContent. Short-link oEmbed markup contributes only a revalidated same-ID
  full Reddit URL; malicious scripts/frames and mismatched identities are discarded.
- Short-link resolution is fixed-host official oEmbed, redirect-free, five-second
  bounded and limited to 64 KiB. No arbitrary provider scraping or server-side
  media proxy was introduced.
- `allow-scripts allow-same-origin allow-popups` applies to the **cross-origin**
  Reddit frame. Its origin remains Reddit. SOP denies parent DOM access. No top
  navigation or popup-escape permission is granted; live/fixture parent-access
  probes and an activated top-navigation attempt were blocked.
- Main script/style/connect policies remain same-origin; no inline/eval/provider
  script exception. Static `_headers` and Worker policies match. No Reddit widget
  script executes in the host. Arbitrary host scripts/frames remain blocked.
- Chromium real HTTP-302 fixture redirects from the provider to `/legal` are rejected
  by the destination's anti-framing protection. Redirecting to `/embed/reddit`
  retains its own CSP sandbox without same-origin privileges; parent access is
  denied. A redirect to an unapproved origin is blocked by host frame-src.
  WebKit's route fixture cannot fulfill HTTP 302, so equivalent provider-script
  frame navigations were exercised there and denied parent access. True WebKit
  HTTP redirect behavior remains **NOT VERIFIED**; it is not claimed as tested.
- The legacy adapter still has nonce/fixed widgets.js CSP, restrictive child-frame
  origin, opaque `sandbox allow-scripts allow-popups`, no connections/images,
  anti-framing rules and denied autoplay. Integrated tests attack its arbitrary
  script/frame and inline execution boundaries independently of the direct frame.
- Original links remain outside frames with noopener/noreferrer and no-referrer.
  A load event/HTTP 200 is never the acceptance signal for actual content.

These findings establish the exercised application boundaries, not an audit of all
provider code or all future provider redirects. No confirmed security regression
was waived. The privacy description of this architecture is nevertheless wrong.

## 5. Live Reddit results

Anonymous public sources; no credentials, bypass, changed network policy or provider
response interception. Only local publication JSON was a fixture. Exact request URLs,
HTTP headers/statuses, frame text/images/video state, console errors and screenshots
are in the raw JSON. Direct URLs below use this exact suffix:
`?embed=true&theme=dark&ref_source=embed&ref=share`.

| Initial source                                                                                     | Constructed embed path on `https://embed.reddit.com`                                           | Chromium                                                                | WebKit                                                                                      |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `https://www.reddit.com/r/aww/comments/crpjwk/`                                                    | `/r/aww/comments/crpjwk/`                                                                      | 403, network-security block; actual post/image absent                   | 200, actual duck post, attribution, image and actions visible; decoded image widths 352/640 |
| `https://www.reddit.com/r/IAmA/comments/z1c9z/`                                                    | `/r/IAmA/comments/z1c9z/`                                                                      | 403, actual text absent                                                 | 200, Obama AMA text/attribution/actions visible; no playable media expected                 |
| `https://www.reddit.com/r/aww/comments/j1bvtv/`                                                    | `/r/aww/comments/j1bvtv/`                                                                      | 403, video unavailable                                                  | 200, actual dog video visible; **FAIL** automatic muted playback without Play               |
| `https://www.reddit.com/r/formula1/comments/7qn3db/one_of_my_favourite_slow_motion_images_of_the/` | `/r/formula1/comments/7qn3db/`                                                                 | 403                                                                     | 200, actual GIF-labelled MP4 visible; automatically animates/repeats without Play           |
| `https://www.reddit.com/r/aww/comments/1t736yi/removed/`                                           | `/r/aww/comments/1t736yi/`                                                                     | 403                                                                     | 200, `[ Removed by moderator ]`, attribution and actions; original media unavailable        |
| `https://www.reddit.com/r/lounge/comments/vgitaf/the_lounge_new_member_mixer/`                     | `/r/lounge/comments/vgitaf/`                                                                   | 403                                                                     | 200, `Not supported post`; no private content visible                                       |
| `https://redd.it/crpjwk`                                                                           | None: local `/embed/reddit?url=https%3A%2F%2Fredd.it%2Fcrpjwk&resolve=1` returns null identity | Local 200 JSON; no provider content frame; explicit unavailable message | Same                                                                                        |
| Unsupported `/r/private/` community URL                                                            | None                                                                                           | **PASS** deterministic source-only fallback                             | Same                                                                                        |

**Firefox: NOT VERIFIED for every row**, because no page could be launched. Native
Safari visually verified the duck image and animated Formula 1 post using their
same constructed URLs, but provider HTTP status/console/CSP details were not captured
in native Safari; those fields are **NOT VERIFIED**. Native Safari is not being
credited with the complete Chromium/WebKit live matrix.

For every exercised live frame, the host fallback/explanation and source attribution
remained visible outside the frame. Extended/normal-video tests clicked original
links: a new page opened the exact original URL in both engines. Reddit destination
body text was empty at the recorder's observation, so successful original-page
content access is **NOT VERIFIED**, although link navigation is verified. Instagram's
original destination rendered the public caption plus a signup/login prompt; nothing
was submitted.

Chromium's provider 403 is an **ACCEPTED LIMITATION of this test environment**, not
an application URL/CSP defect and not a failure of unrelated features. WebKit logged
provider `bad URL` and stylesheet-CSP errors while actual post content rendered;
these occur inside provider responses and were not suppressed. Live provider console
errors/headers are preserved, not replaced by a claim of zero errors. No host CSP
relaxation or parent access was observed.

The removed sample is moderator removal, not proof of author-deleted body behavior.
The normal video has a deleted author account but visible content; that is also not
an author-deleted post. A verified author-deleted-content sample remains
**NOT VERIFIED**. The premium URL was found in a public Reddit help discussion;
its current provider response is unsupported, not proof of the underlying post's
current existence/eligibility. Current genuine private/restricted-post content
behavior remains **NOT VERIFIED** beyond the reliable fallback. Deterministic
403/404/451 cases separately verify recovery links.

Seed provenance: [public video post](https://www.reddit.com/r/aww/comments/j1bvtv/),
[public animated post](https://www.reddit.com/r/formula1/comments/7qn3db/one_of_my_favourite_slow_motion_images_of_the/),
[removed post](https://www.reddit.com/r/aww/comments/1t736yi/removed/) and
[public help discussion containing the premium URL](https://www.reddit.com/r/help/comments/vklrdt/).
Search results helped select URLs; actual browser observations determine outcomes.

## 6. Session-consent acceptance

| Scenario                      | Classification and evidence                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First visit                   | **PASS**, one modal; no external requests or resource DOM before choice in both automated engines; information pages do not prompt automatically                                                                                      |
| Inert background / keyboard   | **PASS**, conservative initial focus, background cannot steal focus, Tab/Shift+Tab remain in modal, Escape declines, settings return focus                                                                                            |
| Notice wording / privacy link | Rendered heading/body/actions match committed component and handoff; native Safari actually opens `/privacy` through modal link. Independent approved-copy specification was not supplied: exact approval provenance **NOT VERIFIED** |
| Allow / reload / later cards  | **PASS**, sessionStorage persists, no repeated per-card modal, new media waits until near viewport; normal Reddit no-autoplay separately **FAIL**                                                                                     |
| Decline / reload / settings   | **PASS**, no media, readable titles/source links, reload retains choice, settings can change it                                                                                                                                       |
| Revocation                    | **PASS**, loaded frames/images removed, future loads stop; delayed Reddit resolver result cannot create a stale frame; generation invalidation rather than request cancellation                                                       |
| Disabled sessionStorage       | **PASS**, unknown preference fails closed; explicit current-document choice works, notice explains reload asks again                                                                                                                  |
| Independent session           | **PASS**, fresh isolated context prompts again                                                                                                                                                                                        |
| Tab copying                   | **PASS** documented caveat; independent opener-created tab probe copies sessionStorage. Browser UI Duplicate Tab itself **NOT VERIFIED**                                                                                              |
| History / BFCache             | **PASS** real back navigation honors newer decline and synthetic persisted-pageshow tests remove media. Actual persisted BFCache restore **NOT VERIFIED**: explicit attempts in both engines observed `pageshow.persisted=false`      |
| Viewport/performance          | **PASS** independent initial geometry gate; 60 cards over three pages, no duplicate cards/media or extra requests on four repeat scroll cycles; all 60 removed on revoke; no-observer fallback passes                                 |

Representative scrolling proves no duplicate amplification. Loaded offscreen media
is retained after viewing and feed storage grows with unique cards; this is not
virtualization, a memory plateau or a long-duration load certification. No obvious
resource growth independent of unique cards was observed.

Native Safari smoke separately verified first modal, conservative focus, Tab to the
privacy link, decline+reload without repeat prompt, allow+reload without repeat
prompt, settings revocation with paused placeholders, actual Reddit image and
Instagram `/p/` media/actions. Native pre-consent network count, all six viewport
sizes, native BFCache and full security matrix remain **NOT VERIFIED**.

## 7. TikTok sizing and playback

**PASS** deterministic regular-video/image-player fixtures in Chromium and WebKit
at **320, 375, 390, 768, 1024 and 1440px**: vertical 9:16 sizing, visible fixture
controls, original links and no horizontal page overflow. Image-player fixtures use
the existing `/video/<id>` metadata contract; they do not prove `/photo/` ingestion.

**PASS** live official-player sample
`https://www.tiktok.com/@scout2015/video/6718335390845095173`, constructed as
`https://www.tiktok.com/player/v1/6718335390845095173?autoplay=0`.
Both engines returned HTTP 200 and showed the dog/poster, account, play, volume,
progress, settings and fullscreen controls. Six-width live checks found no page or
provider document overflow, clipped visible buttons or unnecessary internal scroll.
At 390px, content viewport was 352×627 Chromium / 352×629 WebKit; minor border/engine
rounding did not clip controls.

Before Play the display remained 00:00/00:10 through the observation interval.
After clicking Play, Chromium advanced to **2.18s**, WebKit to **2.85s**, both with
`paused=false` and `autoplay=false`. This is verified playback of this sample,
not inference from HTTP 200. No provider security/privacy settings were changed.
Provider telemetry/SDK warnings remain in logs.

Live TikTok photo posts and Firefox playback/layout remain **NOT VERIFIED**.
Native Safari displayed the player/poster during the smoke; native playback and
complete control geometry were not certified.

## 8. Instagram sizing

**PASS** deterministic `/p/`, Reel and carousel fixtures in both engines at all six
requested widths. Footer/control fixtures fit their frames and source links remain
available. `/p/` and `/reel/` have distinct reserved heights; no shared 440px cap.

**PASS** live `/p/` rendering for historical `fA9uwTtkSN` (a regular video post,
not a Reel or single-photo test) and public image carousel
[itsjumaah's Lagoon Nebula](https://www.instagram.com/p/C4nMA7mSl-2/).
Both engines returned HTTP 200 for the constructed `/embed/?autoplay=0` URLs.
Screenshots show actual photo/video poster, header/profile, actions, likes and footer.
The historical video was paused at time zero, autoplay false, readyState zero;
its successful playback is **NOT VERIFIED**.

The carousel was additionally checked live at all six widths. No page/provider
horizontal overflow or internal vertical scroll was measured; visible buttons and
original links remained accessible. At 320px the frame content is 282×540; at 390px,
352×620; at 1440px, 538×853. Next-slide buttons were clicked in both engines and
image state changed; before/after screenshots and source state are retained.

Live Reels, a distinct single-photo sample, arbitrary captions/aspect ratios and
Firefox remain **NOT VERIFIED**. Provider-internal height cannot generally be
measured by application code across origins; this fixed-height integration reserves
space and permits scrolling for unusual posts. That is an **ACCEPTED LIMITATION**
of the implementation model, not proof that every provider layout fits.

## 9. General regression

**PASS for freshly exercised application paths:** D06/D07 TikTok deduplication and
contradictory legacy claims/tombstones; D01 missing originals; D04 private/deleted
state; D05 retry durability including uncertain committed writes; parameterized
storage and immutable keys; fail-closed API authentication; infinite pagination,
permalinks and safe text/source attribution; disclaimer and `/legal`/`/privacy`
route/layout; no visitor accounts; manual Telegram provenance/editorial bypass;
monthly changelog selection/citations/calendar boundaries.

Mocked Telegram/OpenClaw/model behavior is not real delivery or installed-host
acceptance. The new no-autoplay claim does **not** pass merely because general
regression and attribute assertions pass. Privacy content accuracy also fails below.

## 10. Confirmed defects

### MQ-001 — P1 — Reddit videos start without Play: FAIL / acceptance blocker

Reproduction on the unchanged built app:

1. Supply a valid local publication for
   `https://www.reddit.com/r/aww/comments/j1bvtv/`, Reddit ID `j1bvtv`.
2. Start a fresh WebKit context; choose ALLOW EXTERNAL CONTENT.
3. Scroll the media near the viewport. Do not click any provider/player control.
4. Observe the real direct `embed.reddit.com` frame and its video state over time.

Expected: video remains paused until an explicit Play action.
Actual: a muted **20.8-second** MP4 starts automatically. Samples two seconds apart
show `currentTime` **0.7649 → 2.8452 → 4.9295 → 7.0104 → 9.0888**, all
`paused=false`, `muted=true`, readyState 4, and autoplay attribute false.
The independent live recorder separately observed playback at 9.74s. Thus this is
not merely an iframe load or an isolated nonzero initial timestamp.

The renderer at `src/lib/render.ts:121` supplies `autoplay 'none'` and global headers
deny autoplay, but those settings do not enforce the promised behavior in the
observed provider/browser combination. The companion Formula 1 GIF-labelled
2.466-second MP4 also animates/repeats without Play; native Safari screenshots show
different movie frames without provider interaction. The normal dog-video result
establishes that the issue is not limited to GIF-labelled media.

Evidence: `reddit-normal-video-results.json`, five `reddit-normal-video-*.png`,
`normal-video-live/live-results.json`, `reddit-video-results.json`, and
`native-safari-video-1.png` / `native-safari-video-2.png`.

Provider-controlled behavior is the immediate cause; the candidate still fails the
explicit product requirement and privacy promise. No host DOM compromise or
permission-bypass exploit is claimed. Resolve this through a reviewed supported
provider integration/fallback or obtain an explicit owner change to the no-autoplay
requirement and truthful notice. Do not waive it implicitly, weaken security, hide
provider controls or inject scripts into provider documents.

### MQ-002 — P2 — Privacy page describes obsolete isolation: FAIL

`src/pages/privacy.astro:68` still says Reddit content runs in an **opaque sandbox**.
The new direct iframe deliberately grants `allow-same-origin` to Reddit and retains
its real Reddit origin. SOP/sandbox still isolate the parent; the opaque-origin
statement is nevertheless false for normal full-URL posts. The same page's
`Videos do not automatically play` at lines 57–58 contradicts MQ-001.

Reproduced on the rendered native Safari privacy route. Evidence:
`native-safari-privacy-ax.txt` and source snapshot/integrity manifest. Correct the
notice alongside the reviewed behavior; this is a disclosure accuracy finding,
not a legal-compliance opinion or evidence of a sandbox escape.

### MQ-003 — P2 — Existing Chromium media test has false distance precondition: FAIL test reliability

At `tests/media-ux-001.browser.mjs:240`, the test assumes card 8 is distant after
clicking footer settings. Footer scrolling actually places it at **top 302.53,
bottom 726.59 in a 1000px viewport**, with scrollY 3496. Loading it is correct.
The original full run and two diagnostic repeats failed this assertion, while two
other unchanged runs achieved all 162 checks. Existing fixtures also assert URL/
permission flags instead of real video inactivity, so they missed MQ-001.

Evidence: `media-suite-initial-results.json`, `chromium-suite-diagnostic.json`,
`suite-reliability-results.json` and the full logs. Independent geometry-based
60-card checks passed. This finding does not establish an offscreen loading defect.
Fix the test precondition in a follow-up; no assertion was removed or weakened here.
The diagnostic recorder's exit 0 means recording completed, not that all cases pass.

## 11. External limitations and remaining unverified scenarios

- **ACCEPTED LIMITATION:** Chromium Reddit network-security 403; provider-null
  short-link resolution; provider-unavailable/removed/private fallbacks work.
  No restriction was bypassed. Live `redd.it` successful rendering is **NOT VERIFIED**.
- **NOT VERIFIED:** Firefox application behavior and native release Firefox; full
  native Safari matrix, physical/mobile devices and assistive technologies.
- **NOT VERIFIED:** true persisted BFCache restoration and UI tab duplication;
  WebKit HTTP-302 redirect fixture; genuine author-deleted/private post state;
  live Instagram Reel/single-photo and TikTok photo-post acceptance.
- **NOT VERIFIED:** all arbitrary provider captions/heights, all video sources,
  production-scale/load/endurance and future provider behavior.
- **REQUIRES OWNER DECISION:** carried direct external-preview DNS/redirect risk;
  browser image loading cannot pin final DNS/redirect destinations under this model.
  Consent does not resolve it. Any change to provider/release scope needs an
  explicit decision; none is assumed.
- **NOT VERIFIED:** deployed Cloudflare access controls, edge redirects/TLS/HSTS,
  caching/platform error headers, remote bindings/migrations, actual logs/cookies,
  intended-host automation and rollback readiness. Staging was not touched.
- Existing operator remains `identity:null`, `contactEmail:null`,
  `contactVerified:false`; real operator/mailbox and reviewed launch disclosures
  remain public-launch prerequisites. No placeholder identity or address was created.

## 12. Exact follow-up Firefox/native acceptance steps

Use a machine where a standard current Firefox application launches; record Firefox
version/build and OS. Preserve security/privacy settings. Do not substitute Chromium.

1. Check out the candidate/fix, run `npm ci`, `npm run validate`, `npm run build`.
   Use fresh local test state only. Start the local Worker with env-file loading
   disabled; use mocked publication reads or isolated local integration fixtures.
2. Install matching Playwright Firefox outside app dependencies. Run
   `WAAGD_BROWSERS=firefox WAAGD_FRONTEND_BASE=http://127.0.0.1:64873 node tests/media-ux-001.browser.mjs`
   and the matching `tests/media-ux-001.live.mjs`. Unavailable engine entries remain
   NOT VERIFIED even if the recorder exits zero.
3. For native Firefox on macOS, run
   `/Applications/Firefox.app/Contents/MacOS/firefox -P` to create a disposable
   `waagd-media-qa` profile, then launch
   `/Applications/Firefox.app/Contents/MacOS/firefox -no-remote -P waagd-media-qa`.
   Set no credentials or extensions. Start `native-fixture.mjs` and
   `native-video-fixture.mjs` from the preserved evidence scripts, or equivalent
   isolated API fixtures. They require the built local Worker at port 64873.
4. Open `http://127.0.0.1:64874/` with Network and Console recording. Before any
   choice verify zero external media requests, one modal, inert background,
   Tab/Shift+Tab/Escape, exact text and working Privacy Policy link.
5. Test allow/reload/later cards, decline/reload/settings, revoke loaded media,
   independent new profile/tab session, duplicate-tab caveat, disabled storage,
   and delayed `resolve=1` response arriving after revoke. Preserve request logs.
6. With a long fixture feed, scroll all three pages; record offscreen frame counts,
   no duplicates and stable counts on repeat scroll. Test actual back/forward
   BFCache restoration and record `pageshow.persisted`, not just navigation type.
7. Exercise image `crpjwk`, text `z1c9z`, ordinary video `j1bvtv`, animated `7qn3db`,
   removed `1t736yi`, premium candidate `vgitaf`, unsupported path and `redd.it`.
   Record initial/constructed URLs, status, actual visible post/media, fallback,
   original navigation, console and CSP separately. Never bypass 403/login/access
   restrictions. Verify the ordinary video stays at zero until Play after the fix.
8. At 320/375/390/768/1024/1440px verify TikTok controls/9:16/no internal scrolling,
   Instagram post/Reel/carousel controls and page overflow, with legitimate current
   samples. Distinguish fixture results from actual provider results. Repeat the
   complete matrix in native Safari; the limited smoke here is insufficient.

## 13. Three release verdicts

**A. LOCAL ACCEPTANCE — FAIL.** MEDIA-UX-001 cannot be accepted as implemented under
the current no-autoplay requirement. MQ-001 is reproducible on a normal live video;
MQ-002 is confirmed inaccurate copy. Most session/layout/security/general regression
checks pass, but full cross-browser acceptance also remains **NOT VERIFIED**.

**B. RESTRICTED STAGING — HOLD / REQUIRES OWNER DECISION.** Do not promote this
candidate as accepted or update the existing staging deployment under this task.
Resolve MQ-001/MQ-002 and stabilize MQ-003, then rerun affected independent checks
and Firefox/native acceptance. An explicitly authorized access-restricted diagnostic
staging exercise is a separate owner decision; no such exception is assumed.
Chromium's provider 403 alone is not the reason for this hold.

**C. PUBLIC PRODUCTION — NO-GO.** In addition to those fixes and missing browser/
provider evidence: configure real operator identity and verified contact; review
actual legal/privacy/rights/removal/retention facts; record the preview-risk and
historical-identity/import decisions; separately authorize and verify genuinely
restricted staging access across hostname/assets/API/adapter and alternate URLs;
complete deployed edge/auth/data/migration/rollback and intended-host automation
checks. No public launch or infrastructure authorization is implied by this report.

**Recommended next action:** return MQ-001/MQ-002/MQ-003 to the implementation owner
for a scoped fix, preserving restrictive CSP and direct-provider isolation; then
request independent reacceptance with working Firefox and the normal live-video
regression case. No application fix was attempted during this independent audit.

## 14. Evidence and delivery

Primary evidence root: `output/playwright/media-qa-001/`. Fresh existing-suite media
JSON/screenshots: `output/playwright/media-ux-001/`. Integrated security/legal
screenshots remain in `output/playwright/`; legacy acceptance evidence is in
`output/regression-001/` and `output/release-qa/`.

Reviewed actual screenshots include WebKit Reddit duck image/text, both engines'
TikTok/Instagram media, live carousel before/after, six-width fixtures, native
Safari Reddit image/animated video/privacy and revoked placeholders. JSON preserves
provider diagnostics; command logs preserve failed attempts as well as corrections.
A local evidence archive and SHA-256 integrity manifest accompany the committed
report under `output/`, excluding downloaded browser binaries/profiles/tool caches.

Task-owned servers, CLI session and two native Safari QA tabs were closed after
capture. Report formatting and Git whitespace checks pass. Source integrity against
the audited commit is preserved; main/origin-main remain
`6e59767116a8b72f33d888d6677937fa2bef3c3c`. The report delivery commit is separate from
the audited application commit; obtain it from this branch's HEAD.
