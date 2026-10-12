# FE-001 — Doom Monitor frontend

Static Astro homepage with one chronological feed. No framework hydration, accounts,
filters, reactions, sharing, source HTML injection, or third-party scripts. The feed
uses one browser module and the exact types from `shared/contracts.ts`.

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

YouTube, TikTok, and Instagram players use validated provider-specific paths and
constructed HTTPS iframe sources. They load only after an explicit click, use a
sandbox, deny autoplay via Permissions Policy, and retain an original-source link.
Verified TikTok short-link redirects carry canonical video metadata while the original
submitted URL remains clickable. Reddit, unresolved short URLs, invalid provider paths,
and link-only metadata use safe fallback
cards. Provider availability, consent screens, removals, and browser blocking can
still prevent playback. Browser tests stub player requests and verify loading and
fallback behavior; real provider playback requires valid public publications.

Meme images use `object-fit: contain`; news previews use compact landscape frames.
All images are lazy, asynchronously decoded, and have reserved space to limit layout
shifts. The contract provides one image URL without intrinsic dimensions or variant
URLs, so the frontend does not invent responsive image sizes. Broken previews retain
source links. Full Markdown is intentionally unsupported: changelogs support
`#` headings, `[SECTION]` headings, list items, and plain text with preserved line
breaks. Inline markup and HTML are rendered as inert text. Source/reference links
accept only HTTP(S) and open with `noopener noreferrer`.

FIX-001 prepares CSP in `public/_headers` and `worker/security.ts`, permitting only
these frame origins: `https://www.youtube-nocookie.com`, `https://www.tiktok.com`, and
`https://www.instagram.com`. Scripts/styles and API reads stay same-origin; inline
scripts and arbitrary third-party scripts are denied. Preview images require public
HTTPS URL syntax, default ports, no credentials, and no local/reserved address/name.
Unsafe previews render without an image, including old API records. Direct browser
image DNS/redirect destinations cannot be pinned by this renderer; see the remediation
handoff for that remaining limit. Local development illustrations targeting loopback
are consequently suppressed; browser fixture images use mocked public HTTPS URLs.
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
missing/broken images, click-to-load embeds, autoplay denial, and widths of 320,
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
