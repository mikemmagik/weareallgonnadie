# WAAGD site v1.0.0 production deployment runbook

This runbook prepares an isolated production environment for the v1.0.0 release.
It intentionally does **not** deploy it, alter DNS, change staging, access `claw2`,
or create Cloudflare resources. Run it only from a controlled Infrastructure &
Deployment host with the real Cloudflare account selected.

## Release inputs

- Release source/tag: `v1.0.0`.
- Target hostname: `weareallgonnadie.com`.
- Production Worker name: `weareallgonnadie-production`.
- Production D1 name: `waagd-production`.
- Production manifest template:
  [`wrangler.production.jsonc`](../wrangler.production.jsonc).

The committed `wrangler.jsonc` remains the local-only sentinel configuration. It is
never a production manifest. The example production manifest intentionally contains
no real `database_id`, account identifier, or secret.

## Required bindings and secrets

| Item                      | Kind                     | Provisioning rule                                                                                     |
| ------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------- |
| `DB`                      | D1 binding               | Bind only the newly created `waagd-production` database.                                              |
| `ASSETS`                  | Static Assets binding    | Created from `dist/` by the Worker deployment.                                                        |
| `API_WRITE_TOKEN`         | Worker secret            | Generate a new high-entropy production value and set it with Wrangler secret storage.                 |
| Cloudflare API token      | Deployment-host secret   | Least privilege for this account's Workers, D1, and configured custom domain; never a Worker binding. |
| Cloudflare account ID     | Deployment-host setting  | Keep outside Git and select the intended account explicitly.                                          |
| Discovery ingress token   | Private importer file    | Separate `0600` file, never the API write token.                                                      |
| Publisher state directory | Host-local private state | Dedicated `0700` production directory retained across every import run.                               |

The optional Cloudflare Access client ID/secret belong only to the automation host
when that origin is protected; they are not Worker secrets and must remain outside
the repository.

## Create and verify the isolated production resources

1. Check out the signed release tag and run `npm ci`, `npm run validate`, and
   `npm run build` before any remote operation.
2. Create the new D1 database in the approved account:

   ```sh
   npx wrangler d1 create waagd-production
   ```

   Record the returned ID in the secure deployment record. Copy
   `wrangler.production.jsonc` to a protected path outside the repository,
   replace only `REPLACE_WITH_CREATED_PRODUCTION_D1_DATABASE_ID`, and review the
   resulting name, binding, assets, and custom-domain route. Do not use the all-zero
   local sentinel or a staging database ID.

3. Apply the ordered migrations once to the new database:

   ```sh
   npx wrangler d1 migrations apply waagd-production --remote \
     --config /secure/path/wrangler.production.jsonc
   ```

   Wrangler records applied migrations and captures a backup before an apply. Stop
   if the database name or ID is not the newly created production resource.

4. Set the Worker write secret without printing it:

   ```sh
   npx wrangler secret put API_WRITE_TOKEN \
     --config /secure/path/wrangler.production.jsonc
   ```

5. Build and perform the controlled deployment only after Infrastructure approval:

   ```sh
   npm run build
   npx wrangler deploy --config /secure/path/wrangler.production.jsonc
   ```

   The custom-domain entry is for the apex only. Add `www` only under a separate
   DNS/product decision; do not infer redirects or extra hostnames.

6. Verify HTTPS responses on the configured hostname: `/`, `/legal`, `/privacy`,
   `GET /api/posts`, an unauthenticated `POST /api/posts` (401), and an authenticated
   test publication/duplicate cycle. Confirm the CSP, `X-Content-Type-Options`,
   `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`, and HSTS headers on
   both static and Worker-generated responses. Validate click-to-load and no-autoplay
   with safe public test content before enabling automatic publication.

Cloudflare Static Assets and the Worker are deployed together. The manifest preserves
selective Worker-first routing for `/api`, `/api/*`, and `/embed/reddit`; other static
assets remain asset-first.

## D1 migration inventory and staging transfer

Apply these files in order to a clean production database:

1. `0001_posts.sql` — strict posts schema, uniqueness, chronological index, and
   immutable identity/deletion triggers.
2. `0002_url_less_news.sql` — forward-only replacement-table migration for
   source-identified URL-less news.
3. `0003_publication_intent_v2_quota.sql` — append-only publication audit and atomic
   five-per-UTC-day automatic-publication slots.

For a clean production D1, apply all three exactly once. The local integration suite
applies them twice to disposable D1 storage to verify idempotent migration tracking.
Do not copy the local sentinel database or point production at staging.

Default cutover is a clean production feed. If confirmed staging publications must be
carried forward, the permitted method is a separately approved replay of the original,
immutable `PublicationIntent` files through the production `publish-import` command,
one at a time, using a new production-only Publisher state directory. This preserves
content hash and semantic identity in `publication_audit`; server-generated post IDs
and timestamps will be new. Confirm each `created` or `duplicate` result, retain the
receipts, and never bulk-copy D1 tables or bypass the Publisher. Staging remains
unchanged.

## Automatic publishing and rollback

Leave the production Publisher auto-paused after its first state initialization.
After the deployment smoke check and Discovery contract confirmation, an operator may
explicitly run `policy auto resume` once against the persistent production state. The
importer never resumes it; `policy auto pause` is the immediate kill switch.

For an application rollback, pause automatic publication, preserve the Publisher
state/receipts/outbox, and use Cloudflare's Worker version rollback to the last known
good compatible release. Re-run the read/write smoke checks afterward. D1 migrations
and posts are forward-only: do not reverse them. If a database corrective action is
needed, take a backup and use a reviewed forward corrective migration or a Cloudflare
restore procedure.

## Infrastructure handoff blockers

- A real production Cloudflare account, D1 database ID, least-privilege deploy token,
  and `API_WRITE_TOKEN` are not present in this repository and must be supplied by
  Infrastructure.
- Domain ownership/zone readiness for `weareallgonnadie.com` must be confirmed by
  Infrastructure before the custom domain is deployed.
- The locally available Discovery checkout has no `v1.0.0` tag. Its release owner
  must confirm the exact immutable producer release and contract compatibility before
  unattended production import is enabled.
- Live Cloudflare edge/TLS/platform-error behavior and third-party provider behavior
  require the controlled post-deployment smoke check; they cannot be established by
  local tests.
