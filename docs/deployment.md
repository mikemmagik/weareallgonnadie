# Deployment preparation

## Development configuration

The committed configuration is local preparation only:

- Worker name `we-are-all-gonna-die`, entrypoint `worker/index.ts`.
- Compatibility date `2026-10-12`, without Node compatibility flags.
- Static Assets from `dist/`, with `ASSETS` binding and Worker-first API/Reddit-adapter routing.
- `DB` binding named `waagd-local` with all-zero sentinel database ID, publication
  migration under `db/migrations/`, and `remote: false`.
- `workers_dev: false`; no custom domain or account ID is configured.

`wrangler dev --local` simulates bindings locally. The sentinel is not a usable
production database ID. Use `npm run dev:full` to build assets and start the local
combined service after `npx wrangler d1 migrations apply DB --local`. Public reads
need no credentials; POST/DELETE require a local `API_WRITE_TOKEN` in ignored `.dev.vars`.
See [backend setup](../worker/README.md).

## Environment variables and secrets

| Name                    | Local MVP                                              | Future production                                                               |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `API_WRITE_TOKEN`       | Required in `.dev.vars` for authenticated local writes | Required secret binding for write/delete authentication; fail closed if missing |
| `CLOUDFLARE_API_TOKEN`  | Not needed                                             | Deployment-machine secret with least required permissions, never committed      |
| `CLOUDFLARE_ACCOUNT_ID` | Not needed                                             | Deployment-machine identifier for the approved account                          |
| Automation API base URL | Private local environment                              | Same-origin site's HTTPS API base, held in local automation configuration       |
| Automation bearer token | Private local environment                              | Local secret matching the approved Worker write secret                          |
| Telegram/AI credentials | Private local environment                              | Only in local agent/bot secret storage; never frontend or repository            |

`DB` and `ASSETS` are bindings, not frontend environment variables. No `PUBLIC_*`
secret values are permitted. `.dev.vars` and all environment variants are ignored;
`.dev.vars.example` is a safe placeholder only.

For diagnostics in restricted environments, set `ASTRO_TELEMETRY_DISABLED=1`,
`WRANGLER_SEND_METRICS=false`, and `WRANGLER_LOG_PATH=.wrangler/logs` for the command.
Use `XDG_CONFIG_HOME=.wrangler/config` and `XDG_CACHE_HOME=.wrangler/cache` to
keep Wrangler preferences/cache inside the ignored project state. The smoke test
sets these itself, isolating it from saved account credentials and global preferences.
These are tool preferences, not application requirements.

## Credential-free preparation

```sh
npm ci
npm run validate
npm run build
```

`npm run build:worker` is exactly a Wrangler `deploy --dry-run` bundle build.
It does not publish the project or require Cloudflare credentials. The smoke test
removes inherited Cloudflare credentials and regenerates both outputs before checking
them. `dist/`, `build/`, and `.wrangler/` are ignored generated files.

## Later deployment outline — not performed in this task

Deployment still needs a separate request. INT-001 implements the local frontend,
backend and mocked automation integration; no production resources are configured.

1. Run validation and review the artifact and source revision. Review current Free
   limits, security headers, logs, write authentication, and D1 schema constraints.
2. Select the approved Cloudflare account and establish least-privilege deploy access
   outside Git. Create the approved D1 database only at that time; replace the sentinel
   with its real binding name and ID in a reviewed configuration.
3. Review and back up any existing data. Apply approved migrations in local simulation
   first, then explicitly to the intended remote database. Never infer remote targets
   from the foundation sentinel.
4. Provision the real write secret through Cloudflare secret storage, not `vars` or
   static frontend build variables. Authentication must already be implemented.
5. Build static assets and deploy Worker + assets together using Wrangler. Configure
   the approved domain and smoke-check assets, API JSON, anonymous reads, unauthorized
   writes, authenticated writes, duplicates, pagination and soft deletion.
6. Record the deployed revision, Worker version ID, configuration and migration state.

## Rollback outline

Record a known-good deployment version before changes. Cloudflare's Worker rollback
can restore a previous deployed version (including its associated assets); review
binding and secret compatibility before doing so. A Worker rollback does **not**
undo D1 migrations or content changes. Prefer backward-compatible migrations and
follow a separately reviewed backup/restore or corrective migration procedure for
D1. Revalidate reads and writes after rollback. No rollback action was needed here.

## Official references

- [Wrangler commands and dry-run bundling](https://developers.cloudflare.com/workers/wrangler/commands/workers/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Worker versions and rollback](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/)
- [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)

## INT-001 automation prerequisites

Before enabling on the owner's existing MacBook/OpenClaw host, check the installed
CLI flags/SDK against [the setup guide](../automation/openclaw/INSTALL.md), provision
private environment/state outside Git, create the dedicated bot and allowed numeric
IDs, verify one polling owner with no webhook, create a dedicated tools-disabled
editorial agent using the existing subscription, then review daily/monthly native
command schedules. Configure `WAAGD_TIMEZONE` consistently. None of those live changes
were made in INT-001. Public site availability is independent of local automation.

Review deployment headers/CSP for the three allowlisted iframe origins and external
preview images; source text remains escaped. Recheck provider playback with valid
public content during QA. If importing pre-integration data, reconcile any old
tracking-sensitive canonical URLs with collision/tombstone review before enabling
writes; the integration tests use a fresh local database.

## FIX-001 security header preparation

`public/_headers` is copied to `dist/_headers` for directly served static assets.
`worker/security.ts` attaches the same policy to every application Worker response,
including API successes/errors and asset fallback responses. Worker-first routing
also includes the exact `/embed/reddit` route in FIX-002. Cloudflare documents that static `_headers` rules do not apply to
Worker-generated responses; see [Static Assets headers](https://developers.cloudflare.com/workers/static-assets/headers/)
and [Worker security headers](https://developers.cloudflare.com/workers/examples/security-headers/).

Prepared policy:

- CSP defaults to no resources. Scripts, styles and API connections are same-origin;
  inline scripts/styles, eval, arbitrary third-party scripts, objects and forms are
  denied. `base-uri 'none'` prevents injected base URLs.
- Frames allow exactly YouTube NoCookie, TikTok and Instagram HTTPS origins.
  `frame-ancestors 'none'` plus `X-Frame-Options: DENY` prevents framing this site.
  Third-party iframe content has its own policy; the host does not run provider scripts.
- Images allow same-origin assets and HTTPS preview origins. The scheme allowance is
  intentional for public source previews, and is not an arbitrary script/frame allowance.
  The renderer separately suppresses known local/private URLs. Browser DNS/redirect
  destinations cannot be pinned under the direct-image/no-proxy model.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and explicit
  Permissions Policy deny autoplay, camera, microphone, geolocation, payment and USB.
  Fullscreen is restricted to the host and the three reviewed players.
- HSTS is `max-age=31536000`. Browsers ignore it on insecure local HTTP; production
  must serve HTTPS. No includeSubDomains/preload commitment is made for unreviewed
  subdomains. Configure/review edge HTTPS behavior only during authorized deployment.

The real local HTTP integration suite checks HTML, CSS, JavaScript, SVG, missing
assets, public API reads, unknown routes and auth/validation failures. Production
Chromium checks confirm the feed loads under CSP and scripts are blocked as intended.
This verifies local Wrangler behavior only. Edge redirects, platform-generated errors,
TLS/HSTS enforcement, remote assets/cache behavior and provider playback still require
separately authorized deployment and smoke testing. Keep `_headers` and Worker values
aligned; the integration test compares actual responses to the Worker policy.

## FIX-002 scoped Reddit adapter policy

Keep `/embed/reddit` in `assets.run_worker_first`; it is generated by the Worker,
so static `_headers` must not supply its exception policy. The adapter explicitly
sets HTML/no-store, CSP sandbox `allow-scripts allow-popups` (no same-origin),
`frame-ancestors 'self'` and SAMEORIGIN. Its script policy allows a per-response nonce
and the exact official widgets.js path; child frames allow only embed.reddit.com.
Connections/images/objects/forms/base URLs are denied; inline styles are allowed only
inside this isolated document for the official widget. The original deny-autoplay
Permissions Policy and other security headers remain. The main static and Worker CSP
add same-origin frames, while main script/style policies remain unchanged. Other
same-origin documents still deny framing.

Verify this route and ordinary assets/API responses separately on a future authorized
Cloudflare deployment. Local Wrangler/browser results do not establish edge/TLS/cache
behavior. Live Reddit may return 403 or impose eligibility/cookie/geographic restrictions;
review the FIX-002 handoff before declaring production acceptance. The unchanged
external-preview DNS/redirect limitation still needs an explicit product decision.

## LEGAL-001 launch prerequisites

Complete and verify public operator identity/mailbox in `src/lib/legal.ts`, rebuild,
and review applicable disclosure, privacy, retention and content-rights requirements.
Review actual Cloudflare logs/security cookies and email-provider processing before
updating the privacy notice. `/legal` and `/privacy` inherit existing static headers;
Worker/Reddit headers remain unchanged. Click-to-load reduces unsolicited requests
but does not remove the post-consent preview DNS/redirect risk. Existing QA blockers
remain; see [LEGAL-001 handoff](legal-001-handoff.md).

## MEDIA-UX-001 local verification

No deployment, staging, DNS, remote D1, secrets or automation installation changes.
Main static and Worker CSP now also allow exactly https://embed.reddit.com frames;
provider scripts remain disallowed in the host. Deploying this later would require
matching assets/Worker policy. The legacy HTML adapter keeps its opaque scoped CSP;
its optional resolve=1 JSON response uses the ordinary restrictive headers.

The current consent preference is session-wide and loads media near the viewport.
It replaces the historical per-item click behavior above. See the
[handoff](media-ux-001-handoff.md) for local browser setup, live-provider findings and
remaining Firefox/native Safari/device checks. Rebuild before starting local QA;
restart a local asset server after a build, and do not rebuild while testing its
existing asset manifest. This is a local development concern, not a staging change.

## MEDIA-FIX-002 local remediation

No staging, deployment, DNS, secrets, schema, remote D1 or automation changes.
Static and Worker security headers remain unchanged. Rebuild the frontend and
restart the local asset server before acceptance. The direct Reddit default now
requests content-free summaries; a trusted Play / view action enables full content.
The legacy adapter uses the same supported content-free widget option inside its
existing opaque sandbox. No new provider origins or permissions are needed.

See [the remediation handoff](media-fix-002-handoff.md) for exact baseline/playback
results, repeatable geometry checks, compatibility tradeoffs and independent QA.
Chromium's Reddit 403 and unavailable Firefox must not be credited as live playback
passes. This remediation does not authorize promotion of the existing staging site.
