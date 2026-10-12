# Foundation handoff

## Backend agent

Read `shared/contracts.ts` and `docs/api.md` before implementing the four reserved
routes. Add reviewed D1 migrations, parameterized SQL, immutable UTC insertion time,
UUID tie-breakers, atomic uniqueness, soft deletion, bounded input, and fail-closed
bearer authentication. Preserve duplicate-as-success semantics, including deleted
matches. Test database constraints, pagination ties, auth failures and retries using
local D1. Production resources and deployment need a separate request.

## Frontend agent

Keep Astro static. Consume public API reads and shared types with minimal client
JavaScript when a feed is requested. Implement the chronological UI, safe text/Markdown
rendering and allowlisted embeds with source-link fallbacks only in the next authorized
phase. Do not add visitor authentication or expose write secrets. The current homepage
and 404 are deliberately minimal placeholders.

## Automation agent

Implement API-only clients under `automation/` when requested. Do not touch the existing
OpenClaw installation or register a Telegram bot. Telegram links are already approved;
preserve their origin. Treat `200 duplicate` as successful processing, retry temporary
failures with backoff, and provide a stable `source_item_id` for monthly URL-less
changelogs. Keep all credentials local. Discovery and generation remain unimplemented.

## Shared governance and remaining work

No role may independently change shared contracts. Coordinate changes with the project
owner and update types, docs, tests and all consumers together. The D1 schema,
production authentication/API logic, final UI and all automation are intentionally
pending, not failures of the foundation. Local validation outcomes and the created
file inventory are reported with the initialization delivery.

## Verified at delivery

- Dependencies installed successfully; npm reported zero vulnerabilities.
- `npm run validate` passed: frontend/Worker/test TypeScript, ESLint, Prettier,
  nine unit tests and one build smoke test.
- The smoke test rebuilt both Astro and the Worker without Cloudflare credentials.
- Combined local HTTP checks passed: homepage 200, reserved API JSON 501, unknown
  API JSON 404, and static custom 404.
- Git initialized on `main`; files are uncommitted. No remote, push, deployment,
  production database, token, bot, or OpenClaw modification was made.
- Environment limitation: Wrangler's asset watcher reported a platform limit in
  the validation sandbox. Rebuild and restart for updated assets if that warning
  occurs. No unresolved implementation or build failures remain.
