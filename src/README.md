# FE-001 — Doom Monitor frontend

Static Astro homepage with one chronological feed. No framework hydration, accounts,
filters, reactions, sharing, source HTML injection, or third-party scripts. The feed
uses small native browser modules and the exact types from `shared/contracts.ts`.

## Start and integrate

Run `npm ci` once, then `npm run dev`. Open
`http://127.0.0.1:4321/?demo=1` for the explicitly labeled fictional development feed.
The fixtures and their SVG illustrations live in `src/dev/`. Astro removes the
DEV-only import from production; the build smoke test verifies no mock publications
or mock browser assets are emitted. The unmodified homepage always requests the API.

Run `npm run dev:full` to build the frontend and serve it alongside the local Worker
at `http://127.0.0.1:8787`. The integrated Worker supplies the real feed. No frontend endpoint
configuration is needed: public reads go to same-origin `/api/posts?limit=20`, then
include URL-encoded opaque `cursor` values returned as `data.next_cursor`. No write
token belongs in the frontend. API calls time out after 15 seconds and allow manual
retry without discarding existing posts or advancing a failed pagination cursor.

Successful responses use `{ ok: true, data: { posts, next_cursor } }`. The browser
validates untrusted JSON using the shared content validator, rejects malformed
responses, omits soft-deleted posts, deduplicates IDs, and keeps descending
`(published_at, id)` order. `published_at` is the feed insertion date; the current
contract has no separate original publication date. Empty/missing titles receive a
readable fallback; nullable previews, body, and embeds are supported.

Publication permalinks use `/?post=<id>` and the existing item endpoint. The result
is inserted once into the current feed, sorted without advancing its pagination
cursor, highlighted and focused. Missing/deleted IDs show a readable status; transient
failures offer a dedicated retry. Telegram and monthly source references use this URL.

## Media and rendering

Validated YouTube, TikTok, Instagram and Reddit frames and external previews load
near the viewport after one session-wide consent choice. The native dialog stores
allow/decline in sessionStorage, with footer settings and safe unavailable-storage
handling. No per-post consent overlay remains. Session consent never grants autoplay;
original links survive.
TikTok uses 9:16 up to 400px; Instagram posts and Reels have separate responsive heights.

Reddit uses the current official widget-generated embed.reddit.com iframe directly
at its isolated provider origin. The opaque legacy adapter is retained for regression;
its resolve=1 JSON mode resolves redd.it via bounded official oEmbed after consent.
Use the integrated Worker for short links. Unsupported or blocked content retains
attribution and a persistent recovery link. Fixture success is separate from live
provider eligibility. See [MEDIA-UX-001](../docs/media-ux-001-handoff.md).

Reddit initially shows the official content-free summary in a 300px container,
including the activation button. Long summaries retain native iframe scrolling.
The explicit Play / view Reddit media action expands the container to its existing
620px full-content size and focuses the frame without scrolling the page. Full
content may play video/GIF media after that action; session consent alone never
activates it. Revoking consent removes the frame and resets the compact state.

Meme images use `object-fit: contain`; news previews use compact landscape frames.
All images are lazy, asynchronously decoded, and have reserved space to limit layout
shifts. The contract provides one image URL without intrinsic dimensions or variant
URLs, so the frontend does not invent responsive image sizes. Broken previews retain
source links. Full Markdown is intentionally unsupported: changelogs support
`#` headings, `[SECTION]` headings, list items, and plain text with preserved line
breaks. Inline markup and HTML are rendered as inert text. Source/reference links
accept only HTTP(S) and open with `noopener noreferrer`.

FIX-001 prepares CSP in `public/_headers` and `worker/security.ts`, permitting only
same-origin Reddit adapter frames plus these provider origins: `https://www.youtube-nocookie.com`, `https://www.tiktok.com`, and
`https://www.instagram.com`. Scripts/styles and API reads stay same-origin; inline
scripts and arbitrary third-party scripts are denied. Preview images require public
HTTPS URL syntax, default ports, no credentials, and no local/reserved address/name.
Unsafe previews render without an image, including old API records. Direct browser
image DNS/redirect destinations cannot be pinned by this renderer; see the remediation
handoff for that remaining limit. Same-origin development illustrations may load normally; external browser fixture
images use mocked public HTTPS URLs and require session permission.
INT-001 preserves wire fields and the renderers while integrating permalink reads.

## Validation

Run `npm run validate` for Astro/TypeScript, ESLint, Prettier, existing contract and
Worker tests, and the real static frontend plus Worker dry-run build. Run
`node --test tests/frontend.test.ts` for frontend wire parsing, pagination,
deduplication, empty/error/retry behavior, safe links, and provider rendering rules.
No new test dependency or package-script change is required.

Browser verification uses the Playwright CLI from the installed Playwright skill.
Start the Astro server on `127.0.0.1:4321`, open a CLI browser session named `doom`,
then run `node tests/frontend.browser.mjs`. The CLI is obtained via `npx`; a locally
installed Playwright browser is needed. The script tests all four post types, inert
HTML, loading/empty/error/end states, scroll pagination and retry, safe links,
missing/broken images, session-controlled embeds, autoplay denial, and widths of 320,
390, 768, and 1440 pixels. It saves screenshots to `output/playwright/` using
fictional development publications. Make that output directory before running.

`npm run build` is local only: Astro static output plus Wrangler **dry-run**.
Deployment is not part of FE-001.

## Historical FE-001 delivery

Changed files:

- `src/pages/index.astro`, `src/pages/404.astro`, `src/styles/global.css`
- `src/lib/feed.ts`, `src/lib/presentation.ts`, `src/lib/render.ts`
- `src/scripts/monitor.ts`, `src/README.md`
- `src/dev/mock-feed.ts`, `src/dev/robot.svg`, `src/dev/ice.svg`,
  `src/dev/meme.svg`, `src/dev/missile.svg`
- `public/earth.svg`, `public/favicon.svg`
- `tests/frontend.test.ts`, `tests/frontend.browser.mjs`, `tests/build.smoke.test.ts`

Delivery checks passed: `npm run validate`, nine additional frontend unit tests,
34 Chromium browser assertions, and a local combined Worker/static-assets check
confirming homepage 200, API 501, and no production mock posts even with `?demo=1`.
Screenshots show the explicitly labeled development feed at 1440×1100 and 390×844,
plus full-feed captures. Provider playback itself remains dependent on public content
and provider policy. No deployment was performed.

FIX-002 browser integration includes a deterministic widget fixture checking sandbox,
CSP, parent isolation, attribution, missing metadata and news/meme compatibility.
`WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=<session> npm run test:backend` runs it
against actual local HTTP/D1. Add `WAAGD_LIVE_REDDIT=1` for the separate live-provider
attempt. Provider HTTP failures are recorded as limitations, not mocked success.

## LEGAL-001 disclaimer and media privacy

A persistent disclaimer, `/legal`, `/privacy` and footer contact links now accompany
the feed. Configure public operator fields in `src/lib/legal.ts` and verify a real
mailbox before launch. External media now uses the session-wide preference described
in MEDIA-UX-001; reloads preserve the session choice. Embed previews are not fetched
separately. First-party assets may load normally. See the
[LEGAL-001 handoff](../docs/legal-001-handoff.md) for configuration/blockers.

Run `WAAGD_BROWSER_SESSION=<session> node tests/legal.browser.mjs <local-origin>`
for additional browser checks. The optional backend browser suite also executes
these checks against production assets.
