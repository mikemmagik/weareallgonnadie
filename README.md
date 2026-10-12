# We Are All Gonna Die

Technical foundation for a minimalist, dark-humor content aggregator about AI,
automation, existential threats, disasters, pandemics, and technological absurdity.
Existing content will appear in one chronological feed. The local OpenClaw agent
will eventually discover content, accept already approved Telegram URLs, and submit
a monthly Humanity Changelog through the API.

**Status:** Foundation plus BE-001 backend. All four API endpoints, authenticated
writes, local D1 storage, atomic duplicate handling, soft deletion and cursor pagination
are implemented. The homepage remains a frontend placeholder. Discovery, Telegram
integration and changelog generation belong to Automation. See [backend setup and
integration](worker/README.md).

## Requirements

- Node.js **24.x** (use `.nvmrc`); npm **11 or newer**.
- Git. No Cloudflare account, credentials, AI key, or Telegram bot is needed locally.
- npm registry access for initial dependency installation.

Node 24 is the deliberately supported even-numbered runtime for this repository.
Dependencies are pinned in `package.json` and `package-lock.json`.

## Install

```sh
cd /Users/mikemmagik/Documents/weareallgonnadie
npm ci
```

## Local development

```sh
npm run dev
```

Astro runs at <http://localhost:4321> with hot reload. This previews only the static
frontend; `/api/*` is owned by the Worker, not Astro.

```sh
npm run dev:full
```

Builds the frontend, then serves assets and the API together at
<http://127.0.0.1:8787> using local Workers/D1 simulation. Rebuild the frontend after
editing it. If Wrangler reports that the assets watcher hit a platform limit,
rebuild and restart the Worker to see asset changes; this warning occurred in the
validation sandbox. Worker changes normally reload automatically. `npm run dev:worker` starts only
the Worker and expects an existing `dist/` from `npm run build:frontend`.

```sh
curl -i http://127.0.0.1:8787/api/posts
```

Apply the database migration first with `npx wrangler d1 migrations apply DB --local`.
GET returns the public feed as JSON 200. Copy `.dev.vars.example` to `.dev.vars` and
replace the placeholder with a local-only secret to enable authenticated writes.
No real Cloudflare database is required. The example's scaffold comments are historical;
see [backend instructions](worker/README.md) for current behavior.

## Build and validation

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:smoke
node --test tests/backend.integration.test.ts
# Foundation checks as one command (integration suite remains separate):
npm run validate
```

- `typecheck`: Astro templates/frontend/shared code, separate Worker environment,
  and test TypeScript. Runtime types stay outside browser configuration.
- `lint`: basic TypeScript/JavaScript ESLint checks. Astro templates use `astro check`.
- `format:check` / `format`: Prettier checks / fixes, including Astro and documentation.
- `test`: Node's built-in runner with native TypeScript stripping; no test framework.
- `test:smoke`: removes stale build outputs, runs both real build commands without
  Cloudflare credentials, checks static HTML with no client scripts and a Worker bundle.

```sh
npm run build
npm run preview
```

`build:frontend` creates `dist/`. `build:worker` uses Wrangler's **dry-run** bundler
and creates `build/worker/`; run it after the frontend build. `build` runs both.
No build command uploads assets, deploys a Worker, or creates infrastructure.
`preview` serves the static build only.

## Repository structure

```text
src/
  pages/                   Static placeholder homepage and 404
  components/              Reserved frontend components
  styles/                  Minimal scaffold stylesheet
  env.d.ts                 Astro type references
public/                    Public build assets (no secrets)
worker/
  index.ts                 API routing and asset fallback
  env.ts                   Explicit ASSETS, DB, write-token bindings
  tsconfig.json            Worker-only type environment
shared/
  contracts.ts             Post/request/response types and input validation
db/
  migrations/              Publication schema, indexes and constraints
  README.md                Local database setup and constraints
automation/
  discovery/               Reserved
  telegram/                Reserved
  changelog/               Reserved
  README.md                API-only integration boundary
tests/                     Contract, routing, and build smoke tests
docs/
  architecture.md
  api.md
  decisions.md
  deployment.md
  handoff.md
AGENTS.md                  Future agent instructions and directory ownership
README.md
package.json / package-lock.json
astro.config.mjs
wrangler.jsonc
eslint.config.mjs
.prettierrc.json / .prettierignore
.gitignore / .npmrc / .nvmrc / .dev.vars.example
tsconfig.json
```

Empty reserved directories contain `.gitkeep` so Git preserves the approved layout.
One repository, no nested packages or infrastructure frameworks.

## Documentation

Read [architecture](docs/architecture.md), [API contract](docs/api.md),
[decisions](docs/decisions.md), [deployment preparation](docs/deployment.md), and
[agent handoff](docs/handoff.md). `shared/contracts.ts` and `docs/api.md` must change
only together under explicit project-owner approval. See `AGENTS.md`.
