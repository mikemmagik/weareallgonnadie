# Deployment preparation

## Development configuration

The committed configuration is local preparation only:

- Worker name `we-are-all-gonna-die`, entrypoint `worker/index.ts`.
- Compatibility date `2026-10-12`, without Node compatibility flags.
- Static Assets from `dist/`, with `ASSETS` binding and API-only Worker-first routing.
- `DB` binding named `waagd-local` with all-zero sentinel database ID, publication
  migration under `db/migrations/`, and `remote: false`.
- `workers_dev: false`; no custom domain or account ID is configured.

`wrangler dev --local` simulates bindings locally. The sentinel is not a usable
production database ID. Use `npm run dev:full` to build assets and start the local
combined service after `npx wrangler d1 migrations apply DB --local`. Public reads
need no credentials; POST/DELETE require a local `API_WRITE_TOKEN` in ignored `.dev.vars`.
See [backend setup](../worker/README.md).

## Environment variables and secrets

| Name                    | Local foundation                                       | Future production                                                               |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `API_WRITE_TOKEN`       | Required in `.dev.vars` for authenticated local writes | Required secret binding for write/delete authentication; fail closed if missing |
| `CLOUDFLARE_API_TOKEN`  | Not needed                                             | Deployment-machine secret with least required permissions, never committed      |
| `CLOUDFLARE_ACCOUNT_ID` | Not needed                                             | Deployment-machine identifier for the approved account                          |
| Automation API base URL | Not configured                                         | Same-origin site's HTTPS API base, held in local automation configuration       |
| Automation bearer token | Not configured                                         | Local secret matching the approved Worker write secret                          |
| Telegram/AI credentials | Not configured                                         | Only in local agent/bot secret storage; never frontend or repository            |

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

Deployment still needs a separate request. BE-001 implements the backend locally;
the frontend remains a placeholder, and no production resources are configured.

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
