# FIX-001 remediation handoff

Prepared for independent local reassessment on **13 October 2026, Asia/Bangkok**,
on `fix/qa-001`, from QA baseline `6467be9` (integrated MVP `c1154e1`). Obtain the
final remediation SHA with `git log -1 fix/qa-001`. The original QA report is retained.

## Resolutions and limits

| Finding | Result                                  | Implementation and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01, P1 | Fixed                                   | Original HTTP 404/410 propagates out of preparation; Telegram reports missing content, no outgoing payload and no POST/D1 row. Available metadata-free pages use neutral titles. 403/429/transport uncertainty remains optional metadata failure. No embed endpoint is consulted to determine original availability. Manual approval still bypasses all AI/editorial filtering.                                                                                        |
| D02, P2 | Fixed                                   | Public transport retains its checked final URL; preparation recognizes canonical TikTok video IDs after vt/vm redirects. `post.url`, tracking normalization and canonical duplicate semantics retain the submitted URL. Multiple-hop DNS checking/pinning, private redirect rejection, four-redirect bound, body limit and deadlines remain enforced. Invalid/unsupported destinations keep original links.                                                            |
| D03, P2 | **Unresolved**                          | Reddit still has no inline renderer. Supported structured metadata, attribution and original links remain; tests explicitly describe the fallback as unresolved, not acceptance of inline functionality.                                                                                                                                                                                                                                                               |
| D04, P2 | Fixed                                   | Every state read/write/remove/list/lock checks an owned 0700 directory. Regular files require owner UID, 0600 and a single link; no-follow file opening, exclusive temporary files and atomic rename prevent following file symlinks. User-created directory/ancestor symlinks fail. Existing 0755 is rejected unchanged with corrective guidance. No arbitrary chmod.                                                                                                 |
| D05, P2 | Fixed                                   | Retry transport failures and 408/429/500/502/503/504, with three immediate attempts, jitter/backoff and Retry-After. Exhaustion retains exact payload, attempts, last status and due time. Later success/duplicate clears outgoing state. Real D1 reproduction confirms an uncertain committed write plus replay leaves one row. Telegram confirms saved state before promising retry. Permanent 400/401/other terminal HTTP failures remove automatic retry payloads. |
| SEC-001 | Hardened; remaining browser limit below | Shared HTTPS preview URL policy rejects credentials, unsafe schemes, non-default ports, known local names and private/reserved IPv4/IPv6 literals, including normalized numeric/hex forms. Metadata and frontend enforce it; invalid images become imageless cards. Existing records are checked at render time. No image is downloaded/proxied.                                                                                                                       |
| SEC-002 | Prepared and locally verified           | Static `_headers` and explicit Worker response headers include CSP, nosniff, referrer policy, Permissions Policy, frame restrictions and HSTS. Real local responses and Chromium enforcement tested. Remote Cloudflare behavior is unverified.                                                                                                                                                                                                                         |
| SEC-003 | Fixed deadline wait; OS limit below     | DNS waiting uses the same abort signal as redirects/sockets. All DNS answers remain checked and one public address pinned. Delayed mocked DNS aborts without opening a socket.                                                                                                                                                                                                                                                                                         |

### Reddit investigation and explicit deferral

[Reddit's official guide](https://support.reddithelp.com/hc/en-us/articles/360043033532-How-do-I-embed-a-Reddit-post-or-comment-in-an-article-or-other-publication)
supports manually generated embeds and oEmbed. Its linked
[official embed documentation](https://publish.reddit.com/assets/Reddit_Embed_Documentation.pdf)
shows `/oembed` returning HTML with a blockquote and `https://embed.reddit.com/widgets.js`.
It does not document a standalone iframe-player URL for this renderer. The current
structured renderer has no reviewed isolated widget adapter, and the documented
snippet does not establish an autoplay guarantee. This is an implementation gap,
not a claim that safe Reddit embedding is impossible.

No arbitrary oEmbed HTML or provider script is introduced into the trusted DOM, and
no guessed iframe endpoint is used. Future work needs an isolated, reviewed adapter,
autoplay/privacy tests and public/private/deleted-content checks under provider terms.
Until then, Reddit publications display attribution and original links. Private or
restricted content does not get an authentication bypass. Inline click-to-load,
safe-frame-origin and autoplay acceptance for Reddit **remain unmet**. The task's
definition of done permits this explicit unresolved disposition; production acceptance
must account for it.

### Security and operational limits

- Preview checks are URL checks. Public-looking hostnames may later resolve privately
  or redirect image requests to another destination. The browser makes those requests;
  this application cannot pin them without changing the no-proxy model. No claim of
  complete DNS/rebinding/redirect protection for external images is made. Review this
  residual risk before production; an approved curated-origin policy or suppressing
  external previews would be a future product tradeoff.
- DNS abort stops waiting and forbids a later connection. Node's OS-backed lookup is
  not itself cancellable and may continue in the background until the OS resolves it.
  Per-attempt deadlines are 35 seconds through `retryRequest`, 15 seconds standalone;
  bounded immediate retries mean a full metadata cycle can exceed one attempt deadline.
- Keep state under trusted parent directories owned/administered by the operator.
  Same-user malicious filesystem replacement is outside this lightweight local-state
  mechanism's guarantees. macOS's root `/var`, `/tmp`, `/etc` aliases are accepted only
  for the exact corresponding `/private` targets. Other symlinks fail closed.
- Ten exhausted submission cycles remain saved for explicit manual review, and generic
  replay skips them; review/remove the exhausted record before deliberately resubmitting.
  Permanent failures require correcting input/auth/configuration and manual resubmission.
  Stale locks require confirming no run is active before removal. No Redis/queue added.
- Provider playback/consent/geographic restrictions remain external dependencies.
  Browser tests mock player/image responses and prove construction and fallbacks only.
  No real bot, AI service or OpenClaw installation was exercised.
- Production TLS, Cloudflare edge/platform-generated responses and remote header/cache
  behavior remain unverified. Existing monthly deletion-race/model/source-parser and
  non-snapshot pagination limits remain as documented in QA-001.

## Actual testing and evidence

Initial permanent regression run before code changes: **7 failed, 1 passed**. It
reproduced D01 twice, D02 twice, D04 once and D05 twice; the one pass records the
unresolved Reddit fallback. Subsequent targeted coverage expands that file to 15 tests.

| Executed command/check                             | Final result                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                           | 395 packages installed; zero reported audit vulnerabilities                                                                                       |
| `node --test automation/tests/remediation.test.ts` | 15 passed                                                                                                                                         |
| `node --test automation/tests/*.test.ts`           | 56 automation tests passed                                                                                                                        |
| `npm run validate`                                 | Astro 0 errors/warnings/hints; TypeScript, ESLint and Prettier pass; 81 unit tests, 1 real build smoke test and 13 local integration entries pass |
| `npm run build`                                    | Astro static build and Wrangler dry-run pass; no deployment                                                                                       |
| Frontend browser command below                     | 34 Chromium assertions pass                                                                                                                       |
| Browser-enabled backend command below              | 14 integration entries pass, including 36 Chromium assertions (23 existing + 13 added)                                                            |

Counts overlap across reruns and should not be summed into a unique test total.
Reddit fallback assertions verify safe behavior and **do not** fix D03. Evidence is
under ignored `output/fix-001/`: `reproduction.log`, `npm-ci.log`, `targeted.log`,
`validate.log`, `build.log`, `frontend-browser.log`, `backend-browser.log`; screenshots
remain in `output/playwright/`. These local artifacts are not part of the commit.
An early lint run caught an unused test import, removed before final validation.
An early browser assertion incorrectly treated Playwright's request-intent event as
proof a CSP-blocked script fetched; it was corrected to check the actual CSP violation.
No product-policy weakening was needed for those harness corrections.

New coverage includes D1 no-row checks, short-link metadata round-trip/duplicates,
multi-hop mocked transport with pinned addresses, mixed DNS/private redirects,
size/redirect bounds and DNS timeout; isolated private-state permission/file/symlink/
ownership checks (caller UID simulated for non-root ownership testing); all requested
temporary statuses, Retry-After seconds/date and existing ten-cycle limits; later
success/duplicate replay and permanent failures; unsafe preview suppression and
production CSP enforcement. Existing tests retain zero-selection discovery, published
monthly material only, pagination, soft deletion, permalinks and click-only/no-autoplay
players. No categories, accounts or reactions were added.

## Independent regression commands

Node 24.x/npm 11+, with a locally available Playwright Chromium. From this checkout:

```sh
cd /Users/mikemmagik/Documents/waagd-fixes
npm ci
node --test automation/tests/remediation.test.ts
node --test automation/tests/*.test.ts
npm run validate
npm run build
```

Browser setup uses an isolated session and configurable frontend URL, preserving any
existing `doom` session/server. Start a free local Astro port in another terminal:

```sh
npm run dev -- --host 127.0.0.1 --port 4337
```

Then:

```sh
mkdir -p output/playwright
cat > output/playwright/fix001.config.json <<'JSON'
{"browser":{"browserName":"chromium","launchOptions":{"channel":"","headless":true}}}
JSON
npx --yes --package @playwright/cli playwright-cli -s=fix001 open http://127.0.0.1:4337 --config output/playwright/fix001.config.json
WAAGD_BROWSER_SESSION=fix001 WAAGD_FRONTEND_BASE=http://127.0.0.1:4337 npm run test:browser
WAAGD_BROWSER_SESSION=fix001 WAAGD_BROWSER_TESTS=1 npm run test:backend
npx --yes --package @playwright/cli playwright-cli -s=fix001 close
```

If 4337 is occupied, choose a free port and use its actual URL consistently. Stop only
the Astro process started for this run (`npx astro dev stop` from this checkout for
daemonized Astro). Backend tests create temporary local credentials, D1 migrations,
state and dynamically allocated Worker ports, then clean them up. They strip inherited
Cloudflare credentials and disable environment-file loading. Never use production tokens.

## Changed files

- Automation: `automation/core/http.ts`, `metadata.ts`, `state.ts`,
  `automation/telegram/handler.ts`, `automation/README.md`.
- Frontend/security: `shared/preview.ts`, `src/lib/render.ts`, `src/README.md`,
  `public/_headers`, `worker/security.ts`, `worker/index.ts`.
- Tests: `automation/tests/remediation.test.ts`, `automation/tests/automation.test.ts`,
  `tests/backend.integration.test.ts`, `tests/frontend.browser.mjs`, `tests/mvp.browser.mjs`.
- Documentation: `README.md`, `docs/api.md`, `architecture.md`, `decisions.md`,
  `deployment.md`, this handoff. Shared wire contracts and schema are unchanged.

## Remaining manual reassessment and production recommendations

Reassess the fixed paths against the preserved QA report; make an explicit production
decision about unresolved Reddit inline rendering and the external-preview DNS/redirect
limit. Test valid public provider content without bypassing platform restrictions.
Review Safari/Firefox/mobile/accessibility, installed OpenClaw/Telegram lifecycle and
model fidelity on the intended host. Review deployment configuration, least-privilege
secrets, real D1 migration/rollback plan and edge HTTPS/headers during a separately
authorized deployment. No production resources, DNS, bot registration, live OpenClaw
changes, deployment or merge into main were performed. Local reassessment readiness
does not constitute production acceptance.
