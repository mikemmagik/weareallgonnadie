# Foundation and backend handoff

BE-001 is implemented on `feat/backend`. See [backend setup, tests and consumer
integration](../worker/README.md). The Foundation verification below is historical.

## Backend agent

The four documented routes are implemented against the unchanged shared contracts.
Apply `db/migrations/0001_posts.sql` using Wrangler `--local` before development, and
configure `API_WRITE_TOKEN` in ignored `.dev.vars` for writes. The separate local D1
HTTP integration suite exercises migrations, constraints, CRUD, pagination ties,
authentication, concurrency and deletion. Production resources and deployment still
need a separate request.

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
owner and update types, docs, tests and all consumers together. The final UI,
automation and production deployment remain pending. The D1 schema and API/authentication
logic are now implemented, without creating production resources. Local validation outcomes and the created
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
