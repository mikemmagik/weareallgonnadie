# FIX-002 — TikTok identity and isolated Reddit rendering

Prepared **13 October 2026, Asia/Bangkok**, on `fix/final-media`, from
`qa/regression-001` baseline `964c79003010848908bea22ab3803fd7986d4fcd`.
The final commit SHA is supplied with delivery; `git rev-parse fix/final-media`
identifies this handoff and implementation together.

**D06 is fixed and its retained acceptance fixture passes. D03 has an implemented,
locally verified official-widget adapter, but live content rendering/playback acceptance
is blocked by Reddit HTTP 403. Do not classify D03 as fully verified or production-ready.**
No production deployment, merge, remote D1, DNS, live bot or OpenClaw change occurred.

## TikTok identity

Automation recognizes the checked resolved TikTok video URL and sets `source: "TikTok"`
and `source_item_id` to its video ID. Direct preparation and discovery payloads use the
same namespace. Structured provider/ID/URL agree, while `post.url` stays exactly as
submitted and ordinary canonical/tracking normalization remains unchanged.

The authenticated Worker derives/checks identity independently from supported URL
structure. It normalizes alternate source labels, fills missing IDs and rejects
contradictory IDs, provider metadata, unsupported originals or canonical hints.
It does not fetch submitted URLs or independently establish that writer-supplied
short-link metadata reflects a live redirect: redirect verification remains the
SSRF-protected automation boundary. Invalid/unresolved links receive no fabricated ID.

The existing unique `(source, source_item_id)` index remains authoritative for new
records. Conditional insertion and duplicate lookup execute inside one D1 batch
transaction, including tombstones. A legacy guard also blocks insertion when an older
row claims the ID through its namespace/embed or canonical-shaped original URL.
One structurally verified older row returns duplicate unchanged; multiple/contradictory
claims return 400 for data review. No existing identity, source URL, ordering timestamp
or deletion state is rewritten, and historical duplicate rows are not implicitly merged.
Legacy scanning is a deliberate compatibility cost; assess it against production volume
before adding an index or migration. No migration/schema change was required.

The retained `tests/regression-001.mjs` file is unchanged. Its first reproduction,
after creating its ignored evidence directory and building the required assets,
confirmed three rows (`3 !== 1`). Final runs have one row across vt/vm/canonical forms.

## Reddit implementation and security

[Reddit's current official guide](https://support.reddithelp.com/hc/en-us/articles/360043033532-How-do-I-embed-a-Reddit-post-or-comment-in-an-article-or-other-publication)
and [official embed documentation](https://publish.reddit.com/assets/Reddit_Embed_Documentation.pdf)
describe blockquote markup plus `https://embed.reddit.com/widgets.js`, and official
oEmbed. The adapter constructs that mechanism from validated post URLs; it never
accepts caller markup, executes arbitrary oEmbed HTML or guesses a player endpoint.
The widget constructs its own child frame. No discovery, media download/reupload,
authentication bypass or private-content retrieval was added.

Supported forms are reddit.com/www.reddit.com/old.reddit.com `/r/<subreddit>/comments/<id>/[slug]`
and redd.it short links, with matching lowercase base36 IDs (3–10 characters).
Comments, communities, user pages, unexpected ports/credentials, bad IDs and mismatched
metadata retain safe source links. News and meme cards both offer click-to-load; a
recognized original with missing or link metadata is also eligible. Attribution and
original links remain outside the frame before and after loading.

Only an explicit click opens the exact Worker-first `/embed/reddit` route. For short
links, only the fixed official HTTPS `/oembed` endpoint is contacted, with redirects
forbidden, a five-second deadline and 64 KiB limit. Returned markup is discarded;
only a validated canonical post URL with the same ID is retained. Provider failures
produce a readable fallback. Canonical post URLs use the official widget directly.

Both the outer iframe and adapter response CSP sandbox grant scripts/popups and omit
same-origin, top navigation and sandbox escape. The provider cannot access the parent
DOM. Popups inherit the sandbox; the host's separate original link remains usable.
There is no parent-message/resize bridge. The fixed 620px scrollable area preserves
provider elements instead of clipping/replacing branding or controls. The adapter does
not rewrite the official widget's child frame or content. See the
[official embedding terms](https://redditinc.com/policies/embeds-terms).

Main scripts/styles retain same-origin CSP; no Reddit script is permitted in the host.
Main frame-src adds same-origin adapter frames. Other host documents still deny framing.
Only the adapter permits its nonce/fixed widgets.js path, embed.reddit.com child frames
and inline styles for official widget sizing. It denies connections/images/objects/forms,
sets no-store, SAMEORIGIN and same-origin frame ancestors, and retains all other security
headers. Static `_headers` and ordinary Worker policies agree; the route exception is
implemented strictly in the Worker and selected in `run_worker_first`.

Autoplay is explicitly denied by parent iframe permissions and inherited response
Permissions Policy; local Chromium confirms the effective adapter policy is false.
No autoplay permission is granted to Reddit or other providers. **Actual Reddit media
behavior, including muted/scripted playback, could not be inspected because the live
provider refused content. Policy assertions alone are not a live playback guarantee.**

## Contracts and changed files

Wire fields, envelopes, status conventions, cursor version and D1 schema remain v1.
The owner-approved TikTok ingestion/duplicate semantic refinement is documented in
`shared/contracts.ts` and `docs/api.md`; all three consumers were reviewed together.
Stored legacy records remain readable through the existing wire validator.

Changed files:

- Shared: `shared/contracts.ts`, `shared/media.ts`.
- Automation: `automation/core/metadata.ts`, `automation/tests/remediation.test.ts`,
  `automation/README.md`.
- Backend/security: `worker/input.ts`, `worker/store.ts`, `worker/reddit.ts`,
  `worker/index.ts`, `worker/security.ts`, `wrangler.jsonc`, `public/_headers`.
- Frontend: `src/lib/presentation.ts`, `src/lib/render.ts`, `src/styles/global.css`,
  `src/README.md`.
- Tests/tooling: `tests/backend.integration.test.ts`, `tests/frontend.test.ts`,
  `tests/mvp.browser.mjs`, `tests/regression-001.browser.mjs`, `tests/media.test.ts`,
  `tests/media.browser.mjs`, `package.json`.
- Documentation: `README.md`, `docs/api.md`, `docs/architecture.md`, `docs/decisions.md`,
  `docs/deployment.md`, this handoff.

No dependencies were added. Historical QA, regression and FIX-001 reports are retained.
Old browser assertions documenting the absent Reddit control were updated to require
its approved remediation; no failing acceptance test was removed or weakened.

## Actual validation

macOS arm64, Node v24.15.0, npm 11.12.1; Astro 7.3.8, Wrangler 4.149.0, real local
workerd/D1. Temporary tokens/configuration/storage, disabled environment-file loading
and remote bindings, loopback HTTP/free ports. Chromium used its existing cached
installation via a private CLI configuration and session `fix002`. Counts below
are runner entries or browser assertions as labeled, and overlap across commands.

| Command/check                                                                                                          | Result                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                                                               | Passed; 395 packages installed, 0 reported vulnerabilities                                                                                                                  |
| `node --test tests/regression-001.mjs`                                                                                 | Passed; 6 runner entries, retained D06 one-row assertion green                                                                                                              |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=fix002 node --test tests/regression-001.mjs`                              | Passed; 7 runner entries plus 19 provider/CSP browser assertions                                                                                                            |
| `node --test automation/tests/*.test.ts`                                                                               | Passed; 56 tests                                                                                                                                                            |
| `node --test tests/media.test.ts`                                                                                      | Passed; 3 grouped tests, official short-link URL extraction, unsupported/restricted/oversized/malicious metadata and scoped adapter CSP                                     |
| `npm run validate`                                                                                                     | Passed; Astro 0 errors/warnings/hints; strict TypeScript, ESLint, formatting; 84 unit tests; 1 build smoke; 16 real D1/HTTP runner entries                                  |
| `npm run build`                                                                                                        | Passed; static frontend and Worker dry-run bundle, no deployment                                                                                                            |
| `WAAGD_FRONTEND_BASE=http://127.0.0.1:54387 WAAGD_BROWSER_SESSION=fix002 npm run test:browser`                         | Passed; 34 assertions against an isolated Astro development server                                                                                                          |
| `WAAGD_BROWSER_TESTS=1 WAAGD_LIVE_REDDIT=1 WAAGD_BROWSER_SESSION=fix002 node --test tests/backend.integration.test.ts` | Passed; 17 runner entries; existing integrated browser scenarios 1/20/2/13 assertions; new deterministic Reddit fixture 28 assertions; separate live-provider outcome below |

D06 coverage includes sequential/reverse/tracking forms, an 18-request race (one
creation and 17 duplicates), differing provider IDs/namespaces, invalid/missing metadata,
source normalization, tombstones, immutable legacy namespaces, legacy canonical rows
without embeds, contradictory metadata and ambiguous historical records. Existing
transport suites retain failed/private/local redirects, mixed DNS, pinning, bounds
and late-DNS/redirect-deadline coverage. Telegram/manual publication remains model-free.

Reddit HTTP/browser coverage includes news/meme/missing metadata, exact supported URL
forms, invalid metadata/URLs, explicit click, no provider requests before click, source
links/attribution, parent DOM denial, script/iframe CSP violations, effective autoplay
policy, 320/390/768/1440 widths and deterministic 404 deleted, 403 private and 451
restricted provider failures with preserved fallbacks. Mocked provider scripts/media
are explicitly fixtures; none are proof of live content rendering/playback.

General regression covers auth/fail-closed writes, CRUD, pagination/order, deletion,
permalinks, monthly changelogs, discovery, manual Telegram, outbox durability, previous
D01/D02/D04/D05 fixes and SEC-001/002/003. Local headers cover static HTML/CSS/JS/SVG,
missing assets, API successes/errors and the separately scoped adapter. No local test
is classified as Cloudflare production/edge verification.

### Failures encountered and corrected

- Initial regression invocation lacked built `dist/` and its ignored evidence directory;
  the runner's cleanup/log race obscured setup with ENOTEMPTY/ENOENT. Building assets
  and creating `output/regression-001` reproduced the actual retained D06 failure.
- Default Playwright Chrome channel was absent. The already installed cached Chromium
  was selected through a temporary configuration; no browser/dependency installation.
- An initial browser fixture counted Reddit buttons across the entire feed instead of
  its target publication and lacked card readiness waits. It was scoped to the target
  card with readiness waits; the positive requirement remains enforced.
- A browser rerun overlapped with smoke rebuilding the served assets and encountered
  an HTTP navigation failure. Builds and subsequent browser runs were serialized.
- An expanded legacy guard initially exceeded D1's LIKE/GLOB complexity limit for a
  different ID and returned 500. Bounded string checks replaced it; that retained
  distinct-ID test and final full validation pass.
- The real provider's 403 remains an external verification blocker, not a corrected
  application failure or a passed playback test.

## Live provider verification and readiness

A real Chromium visit used the public post linked in Reddit's own documentation:
`https://www.reddit.com/r/aww/comments/crpjwk/every_year_this_mama_duck_brings_her_babies_to_my/`.
No credentials/private content were used. The local adapter returned 200; live
`https://embed.reddit.com/widgets.js` returned 200 and constructed the official nested
frame under the scoped CSP/opaque sandbox. That frame returned **403** with
**“You've been blocked by network security.”** No playable media was present;
`contentRendered: false`, `playbackVerified: false` are recorded. Reddit's own
publish.reddit.com page also returned 403 for that example's content frame, supporting
an external/network restriction rather than proving an adapter-specific failure.
No bypass was attempted.

**Ready for independent local regression of the committed remediation. Production
acceptance remains NO-GO pending successful unmocked Reddit content/rendering/playback
and autoplay checks in a permitted environment. D03's full acceptance is not claimed.**
Also retain the prior external-preview DNS/redirect product decision, Cloudflare
edge/TLS/remote D1 validation, other providers' live playback, installed Telegram/OpenClaw
checks, other browsers/physical devices and production volume/performance limits.

Logs remain under ignored `output/fix-002/`; deterministic/live Reddit results and
screenshots are under `output/playwright/`, including `reddit-mobile.png`,
`reddit-desktop.png`, `reddit-live.png`, `reddit-fixture-result.txt` and
`reddit-live-result.txt`. Retained regression evidence is under `output/regression-001/`.
These local artifacts are not committed and should travel with the handoff if reviewed
on another machine. Test-created Worker/D1 state is removed after each run.
