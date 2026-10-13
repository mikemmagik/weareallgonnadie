# LEGAL-001 — Disclaimer, privacy and content transparency

Branch: `feat/legal-disclaimer`. Baseline: `qa/release-candidate`,
`f14de95008ab918464b764118fe0af42d8b9c051`. Review date: 13 October 2026
(Asia/Bangkok). Local pre-production work; no deployment or merge.
This wording is not professional legal advice or a guarantee of compliance.
Jurisdiction-specific legal review remains required.

## Pages and exact disclaimer

The homepage shows a persistent, neutral, accessible disclaimer after the masthead
and before the feed. It has no dismissal or animation. Its exact wording is:

> DISCLAIMER — NOT A NEWS OUTLET
>
> This is not a news outlet. This website is a satirical collection of third-party content, memes, and commentary. Refer to original sources for factual information.

“Read full disclaimer” links to `/legal`. That static Astro page has all seven
requested sections: nature, satire/accuracy, third-party content, intellectual
property, editorial independence, removal and contact. It asserts neither blanket
immunity, guaranteed fair use, unrestricted reuse rights nor DMCA safe harbor.
`/privacy` describes the inspected implementation: Cloudflare hosting/network data,
source navigation, optional images/players, cookies/storage, provider sharing,
email complaints and applicable rights. Footer links expose LEGAL, PRIVACY and
CONTACT on all three pages. No legal entity, jurisdiction or retention period
has been invented.

## Media-loading policy and UX tradeoff

External previews now require LOAD CONTENT, with a notice naming the validated
image hostname and an OPEN ORIGINAL action. No external image element/source is
created before that action. Same-origin HTTP(S) assets may load normally; external
images retain the shared public HTTPS URL policy, including suppression of known
private/local/reserved targets, credentials and non-default ports. Missing news
previews remain compact with source links; unsupported video/meme media keep a
readable fallback. Broken loaded previews show a status and original link.

The extra click trades immediate visual previews for fewer unsolicited provider
requests. Permission applies to one item on the current page, is not saved, and
resets on reload. Embed cards request no separate preview image. Reserved media
space limits layout shifts; news cropping and uncropped meme presentation remain.
No image proxy, rehosting, database or cookie-consent dependency was added.

Embed notices use provider labels from the existing validated renderer. Recognized
Reddit originals still work without stored provider metadata. Invalid metadata
cannot select a player. Notices use DOM text nodes, never arbitrary HTML. The
existing adapter, opaque sandbox, autoplay denial, source validation, safe links
and no-referrer media policy remain. Both `public/_headers` and
`worker/security.ts` were reviewed and are unchanged; new static routes inherit
those policies. The scoped Reddit policy is unchanged. No analytics, advertising,
tracking pixels, marketing cookies, external fonts or sharing widgets were added.

The application does not set visitor cookies or persist choices in browser storage.
Cloudflare security features, if enabled, and loaded providers may use cookies or
process request information. Click-to-load does not eliminate the carried browser
image DNS/redirect risk after consent: there is no application DNS pinning for
browser requests. The baseline owner-decision requirement remains.

## Required operator information and contact configuration

Edit the public build-time `operator` object in `src/lib/legal.ts`:

| Field             | Current value | Required action before public launch                                                              |
| ----------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| `identity`        | `null`        | Supply the real responsible operator's public identity, reviewed for applicable disclosure rules. |
| `contactEmail`    | `null`        | Supply a real monitored mailbox for removal, copyright and privacy requests.                      |
| `contactVerified` | `false`       | Test actual delivery and operator access before setting `true`.                                   |

Rebuild static assets after configuration. These are public values, never secrets.
An absent, unverified or malformed email creates no mailto link. CONTACT instead
leads to `/legal#contact` and an honest unavailable-contact notice. Once verified,
the footer and information pages expose the mailbox. Do not substitute example
addresses or equate valid syntax with a verified, working mailbox.

Also determine applicable jurisdiction/disclosure obligations, any required address
or representative, privacy processing grounds, hosting/email providers and
international processing, enabled Cloudflare security features/cookies/log access,
and a defensible retention policy for complaints/logs. Complete applicable identity
and contact details and revise the privacy page with reviewed deployment facts.
No settings for these unknown facts are implied by the current placeholders.

## Minimal content-removal procedure

1. Receive a complaint through the configured monitored inbox. The legal page asks
   for the publication link or title/original URL, concern, evidence, reply address
   and copyright ownership/authority where applicable.
2. Identify the item via `/?post=<uuid>` and its original URL. Request missing
   identifying details where necessary.
3. Review the claim, rights and context; seek appropriate advice if needed. Do not
   promise a response deadline.
4. If removal is appropriate, use the existing authorized Telegram `/delete <uuid>`
   command. Check confirmation and verify the item is no longer visible in the feed
   or at its permalink. This is existing soft deletion; source sites and duplicate
   tombstones are not erased.
5. Keep a private access-restricted record in the operator's existing email/secure
   records: complaint, ID/URL, review, decision, action/time and reply. Limit access
   and retention to the reviewed purpose. Keep records outside Git/public assets.
   No new complaint database or administration UI is introduced.

## Validation and evidence

Final checks used Node 24.15.0, npm 11.12.1 and an isolated cached headless Chromium
session `legal001`. Outputs/screenshots are ignored local artifacts under `output/`
and `output/playwright/`. Provider responses are deterministic fixtures, not proof
of live playback. Counts overlap and must not be summed as unique tests.

| Command                                                                                          | Result                                                                                                                                                                | Evidence                                                                           |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm ci`                                                                                         | PASS; 395 packages installed, zero reported vulnerabilities                                                                                                           | Tool result                                                                        |
| `npm run validate`                                                                               | PASS; Astro 0 errors/warnings/hints, TypeScript/lint/format clean; 86 unit tests, 1 build smoke, 16 real D1/HTTP entries                                              | `output/legal-validate.log`                                                        |
| `npm run build`                                                                                  | PASS; static `/`, `/legal`, `/privacy`, `/404` and Worker dry-run bundle; no deployment                                                                               | `output/legal-build.log`                                                           |
| `WAAGD_BROWSER_SESSION=legal001 node tests/legal.browser.mjs http://127.0.0.1:55721`             | PASS; 65 assertions against Astro                                                                                                                                     | `output/legal-browser-dev.log`                                                     |
| `WAAGD_BROWSER_SESSION=legal001 WAAGD_FRONTEND_BASE=http://127.0.0.1:55721 npm run test:browser` | PASS; 35 assertions, retaining the original assertions and adding image consent                                                                                       | `output/legal-frontend-browser.log`                                                |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=legal001 npm run test:backend`                      | PASS; 17 runner entries; 37 existing integrated frontend assertions, 28 Reddit isolation assertions, 65 new legal/privacy assertions against production assets        | `output/legal-backend-browser.log`                                                 |
| `WAAGD_BROWSER_TESTS=1 WAAGD_BROWSER_SESSION=legal001 node --test tests/regression-001.mjs`      | PASS; 7 entries and 19 supported-provider/CSP assertions                                                                                                              | `output/legal-regression.log`                                                      |
| `node --test tests/release-qa.mjs`                                                               | FAIL, preserved baseline D07; consistent-legacy control passes, three contradictory legacy cases return 200 instead of required 400; 1 pass / 4 fail including parent | `output/legal-baseline-acceptance.log`, `output/release-qa/legacy-identities.json` |

The retained independent acceptance failure is not resolved or excluded. It is
outside the requested storage ownership. Green validation does not override it.
The regression fixture required its existing `output/regression-001/` evidence
directory to be created before the passing run; its source remains unchanged.

Browser coverage includes the exact disclaimer, ordering/persistence, footer/static
routes, widths 320/390/768/1440, readable consent, request timing before/after actions,
per-item choices/reset, same-origin assets, unsafe/missing/broken previews, missing
provider/contact data, original links, no autoplay, Reddit sandbox and CSP enforcement.
Unit tests cover missing/unverified/malformed and configured contact values. Build
tests confirm no placeholder mailto and script-free information pages. Real HTTP
checks cover the new routes' unchanged security headers. Existing tests were adapted
only to click required controls before their image assertions and count the new
original link; no security or functional assertion was removed.

Screenshots of the homepage, consent/feed, legal and privacy pages were visually
reviewed on desktop/mobile. Examples: `output/playwright/legal-home-mobile.png`,
`legal-legal-desktop.png`, `legal-legal-mobile.png`, `legal-privacy-desktop.png`,
`legal-privacy-mobile.png`, `desktop-full.png`, `mobile-full.png`.

Implementation touches `src/`, frontend sections of the integration/browser/build
tests, and frontend/legal documentation. Worker storage/input, contracts, database,
automation/Telegram/OpenClaw and both header files are unchanged. Start locally
with `npm run dev -- --host 127.0.0.1`, or `npm run dev:full` for the integrated
Worker after following the existing local database setup. The task-owned Astro
server and browser session are closed after verification.

## Explicit pre-production blockers

- Real operator identity and verified monitored contact mailbox are missing.
- Review jurisdiction-specific disclosures, legal/privacy wording, copyright/embed
  permissions, removal processing, legal grounds and retention with appropriate
  advice. No compliance certification is provided.
- Baseline RELEASE-QA-001-D07 legacy TikTok identity conflict remains unresolved;
  its storage implementation is outside LEGAL-001 ownership.
- Live Reddit content/playback/autoplay remains NOT VERIFIED after baseline provider
  restrictions. Deterministic sandbox tests do not resolve this.
- Obtain the existing owner decision on post-consent image DNS/redirect exposure
  and review historical records before importing data.
- Production Cloudflare edge/TLS/cache/cookies/log configuration, remote bindings,
  real automation/provider behavior and deployment checks remain pending under
  separate authorization. No staging/public-launch approval is implied.

## Policy references checked

- [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/): hosting
  request processing/logs, with no invented site-specific retention period.
- [Cloudflare cookie documentation](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/): cookies depend on enabled security features.
- [Reddit privacy help](https://support.reddithelp.com/hc/en-us/articles/360043048412-What-information-does-Reddit-collect-about-me-and-my-account): IP-derived location/cookies. Provider behavior is described conditionally, not as observed playback.
