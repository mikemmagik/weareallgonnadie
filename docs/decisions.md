# Approved foundation decisions

These choices apply to this initialization request. Changing shared public behavior
requires project-owner review under `AGENTS.md`.

| Decision                                                        | Reason                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| One Git repository and npm package                              | Shared boundaries without workspace/package overhead                    |
| Astro `output: static`, no adapter                              | Pure static frontend with minimal browser JavaScript                    |
| One Worker project with Static Assets                           | One eventual deployment artifact serves frontend and API                |
| Worker-first routing for `/api` and `/api/*` only               | Keep API responses JSON and static assets served directly               |
| Native Worker request handling, no backend framework            | Four planned routes do not need another dependency                      |
| D1 binding with all-zero local sentinel, `remote: false`        | Validate locally without creating production infrastructure             |
| Separate frontend, Worker and test type configurations          | Keep Node/Worker runtime types away from browser code                   |
| Node 24.x, npm 11+, exact dependency pins and lockfile          | Supported even-numbered runtime and reproducible installations          |
| Node built-in test runner with TypeScript stripping             | No separate test framework or transpilation runner                      |
| ESLint for TS/JS; Astro checker for templates; Prettier for all | Small, explicit quality toolchain                                       |
| Shared discriminated contracts and small runtime validator      | One source of truth with no validation dependency                       |
| Structured provider metadata or fallback link                   | No stored executable HTML; unsupported embeds degrade to links          |
| Immutable server insertion time + UUID descending ordering      | Deterministic newest-first feed and stable cursor tie-breaking          |
| Nullable metadata and an explicit references array              | No ambiguous missing response fields; no references means `[]`          |
| `200 duplicate` vs `201 created`                                | Automation can distinguish processed duplicates from failed submissions |
| Duplicate keys remain occupied after soft deletion              | Retrying old submissions must not resurrect deleted content             |
| Bearer-token writers; anonymous readers                         | Machine-only write access without visitor accounts                      |
| API-only local automation integration                           | Loose coupling and no direct D1/OpenClaw modifications                  |
| Explicit `501` scaffold responses                               | Avoid claiming unfinished publication logic works                       |

No schema migration is created before backend work. No CI provider, remote Git
repository, scheduler, production resource, or deployment is configured. Runtime
limits and security headers for future embedded rendering must be reviewed when
that rendering and production deployment are requested.
