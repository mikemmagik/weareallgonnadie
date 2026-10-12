# Architecture

## Components

- **Astro frontend:** static HTML/CSS from `src/` and `public/`, emitted to `dist/`.
  No framework adapter, SSR, or client JavaScript is needed for the current scaffold.
- **Worker:** `worker/index.ts` owns `/api` and `/api/*`. It implements the four documented
  routes with public reads, bearer-protected writes, bounded validation and JSON envelopes.
- **D1:** the persistence layer, accessed only through the Worker's `DB` binding.
  A local sentinel binding and publication migration are available; no production database exists.
- **Shared contracts:** `shared/contracts.ts` defines JSON shapes, discriminated post
  kinds, input validation, pagination fields, and error codes without database dependencies.
- **OpenClaw:** existing local agent on the owner's MacBook. Future automation code
  lives under `automation/` and talks exclusively to the documented HTTP API.

## Data flow

```text
Reader -> one Cloudflare Worker project
           |-- static route -> Static Assets (Astro dist/)
           |-- /api/* -> Worker -> D1

Public sources -> local OpenClaw daily selection -> authenticated POST /api/posts
Manual URLs -> separate Telegram bot -> already approved -> same POST API
Monthly schedule -> local Humanity Changelog -> same POST API with body/references
```

Discovery should aggregate existing source material, preserve original links and
provenance, and avoid generating ordinary articles. Telegram submissions skip
editorial selection because the human has already approved them. The monthly
changelog has its own body and may have no external URL.

## One Cloudflare project

`wrangler.jsonc` combines `main: worker/index.ts` and `assets.directory: ./dist`.
API patterns run the Worker first. Other matching assets are served directly, avoiding
unnecessary Worker execution. Non-API fallback requests use `env.ASSETS.fetch` and
Astro's static `404.html`; the site is not configured as an SPA.

The static frontend can later use a small same-origin API client for fresh feed data
without rebuilding the site after every publication. No client or feed is implemented
in this phase. Automation writes do not trigger builds or call Astro internals.

D1 access uses parameterized SQL, database uniqueness constraints, a transactional
insert/duplicate lookup, and an indexed feed query. `published_at` is the API insertion time, not the external
source date. The UUID tie-breaker makes equal-timestamp ordering deterministic.
Soft-deleted content stays in storage and uniqueness indexes but disappears from reads.

## Integration boundaries

- Frontend consumes shared types and public JSON reads; it never receives write secrets.
- Worker validates unknown input, authenticates writes, canonicalizes URLs, detects
  duplicates, and stores content through the implemented BE-001 handlers.
- Automation authenticates with a secret stored locally, treats duplicates as successful
  processing, and does not import backend internals or connect to D1.
- No OpenClaw configuration, bot registration, AI subscription change, cron trigger,
  external-content fetch, or production resource is part of this foundation.

## Free-tier posture

Use direct static asset serving, small bounded paginated JSON responses, and indexed
D1 access. No paid bindings, queues, Workers AI, or server-side model calls are added.
The existing local agent and subscription handle future AI work. Usage and provider
limits must be reviewed before production; Free compatibility is not a capacity guarantee.

## Official references

Reviewed 2026-10-12:

- [Astro manual setup and runtime requirements](https://docs.astro.build/en/install-and-setup/)
- [Worker + Static Assets routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
- [Static Assets bindings](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Local Workers development](https://developers.cloudflare.com/workers/local-development/)
- [Local D1 development](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

BE-001 local setup, testing and integration are documented in [the backend guide](../worker/README.md).
The Foundation configuration and all shared API contracts remain unchanged.
