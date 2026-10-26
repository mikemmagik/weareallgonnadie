# We Are All Gonna Die

Integrated local MVP: one newest-first feed of existing news, videos, memes and
monthly Humanity Changelogs. Astro builds static assets; a Cloudflare Worker serves
public reads and authenticated writes against D1. Local automation talks only to
that HTTP API. The site runs independently of automation or OpenClaw.

**Status:** v1.0.0 production release artifact. The site has one Publisher, a
file-based WAAGD Discovery import boundary, and a URL-only owner Telegram adapter.
This repository does not deploy or alter Cloudflare, DNS, staging, or OpenClaw.

## Requirements and local startup

Node **24.x**, npm **11+**, Git and registry access for dependency installation.
Cloudflare credentials, a real bot and an AI service are unnecessary for local tests.

```sh
cd /Users/mikemmagik/Documents/weareallgonnadie
npm ci
npm run db:init
cp .dev.vars.example .dev.vars
# Replace the placeholder in .dev.vars with a private local write token.
npm run dev:full
```

Open <http://127.0.0.1:8787>. The initial feed is empty. INT-001 currently leaves a
preview running at <http://127.0.0.1:8797> because an existing foundation server owns 8787. To use that alternate port after a build:

```sh
npx wrangler dev --local --ip 127.0.0.1 --port 8797 --inspector-port 0
```

Public GETs need no token;
POST/DELETE require `Authorization: Bearer <API_WRITE_TOKEN>`. Never commit `.dev.vars`
or expose its value through browser assets. An absent token fails closed with 503.
The local DB uses a sentinel ID and all migrations explicitly use `--local`.

```sh
curl 'http://127.0.0.1:8787/api/posts'
```

`npm run dev:full` builds and serves frontend + API. Rebuild/restart after frontend
edits; Worker edits normally reload automatically. `npm run dev:worker` expects an
existing `dist/`. `npm run dev` on port 4321 serves Astro only; `/?demo=1` there is
an explicitly fictional development preview. Real publication reads require port 8787. Development fixtures are excluded from production builds.

Publication links use `/?post=<uuid>` on this same homepage. They fetch the existing
item endpoint, focus the requested publication even beyond the first feed page,
and report missing/deleted publications while keeping the feed available.

## Verification

```sh
npm ci
npm run validate
npm run build
```

Validation includes Astro/TypeScript for all three components, ESLint, Prettier,
contract/Worker/frontend/automation unit tests, a credential-free real build smoke
test, and real local D1/Worker integration tests with isolated temporary storage.
No command deploys. `build:worker` is Wrangler's dry-run bundler.

Additional browser verification uses the [Playwright CLI](https://github.com/microsoft/playwright-cli)
with a Chromium browser available locally:

```sh
mkdir -p output/playwright
# In another terminal, start Astro:
npm run dev -- --host 127.0.0.1
# Open a CLI session named doom; use --config if needed for your browser installation:
npx --yes --package @playwright/cli playwright-cli -s=doom open http://127.0.0.1:4321
npm run test:browser
# Reuses that browser session against a real temporary local Worker/D1 + built assets:
WAAGD_BROWSER_TESTS=1 npm run test:backend
```

If Chrome is unavailable but Playwright Chromium is installed, a private CLI config
can use `{"browser":{"browserName":"chromium","launchOptions":{"channel":"","headless":true}}}`.
Pass its path with `open --config /absolute/path/config.json`. Browser scripts fail
on failed assertions. Screenshots and browser session files are ignored by Git.

## Automation and manual setup

See [automation](automation/README.md) for environment variables, commands, retry
state and source configuration. Supply API origin/write token and an absolute private
state directory outside the repository. Telegram uses the existing OpenClaw ingress
and numeric allowed user IDs; it does not need a bot token in this repository. Owner URLs skip editorial classification and
publish with available metadata or a neutral hostname title. Confirmed original
404/410 responses fail before publication. Unsafe
local/private targets remain rejected.

[OpenClaw integration](automation/openclaw/INSTALL.md) documents the pure adapter
boundary for the existing bot ingress. Its actual field mapping and reply path remain
an operator-owned staging check; no additional bot, poller, model call, or service is
introduced by this repository.

Monthly runs paginate all visible publications in the selected calendar month using
`WAAGD_TIMEZONE` (default Asia/Bangkok), excluding deleted posts and other changelogs.
All eligible source publications reach generation; the existing limit of 100 applies
only to cited references. A stable monthly identity makes reruns idempotent.

## Layout and guides

- `src/`, `public/`: static frontend, safe renderers and optional development fixtures.
- `worker/`: routing, auth, cursor and D1 persistence; [backend guide](worker/README.md).
- `shared/contracts.ts`, [API](docs/api.md): common wire shapes and normalization.
- `db/migrations/`: strict publication schema; [database guide](db/README.md).
- `automation/`: HTTP client, private retry state, discovery, Telegram and changelog.
- `tests/`, `automation/tests/`: unit, browser, build and local integration verification.
- [Architecture](docs/architecture.md), [decisions](docs/decisions.md),
  [deployment prerequisites](docs/deployment.md),
  [v1.0.0 production runbook](docs/production-deployment.md),
  [Discovery contract verification](docs/discovery-v1.0.0-compatibility.md),
  [integration handoff](docs/handoff.md).

Known limits: provider playback depends on upstream policy; text/Markdown uses a safe
small subset; source parsers are lightweight; pagination is not snapshot isolation.
Existing pre-integration local databases may retain old tracking-sensitive canonical
keys: initialize a fresh test database or review a separate data reconciliation before
reusing historical records. No production data exists in the supplied foundation.
