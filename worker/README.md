# Backend implementation — BE-001

Four operations implement version 1 wire contracts in `shared/contracts.ts` and
`docs/api.md`. INT-001 integrates their frontend and automation consumers and updates
tracking normalization under the owner's integration request. The Worker does no
external fetch and no production infrastructure has been created.

## Local setup

Use Node 24 and npm 11+, then:

```sh
npm ci
npx wrangler d1 migrations apply DB --local
cp .dev.vars.example .dev.vars
# Replace API_WRITE_TOKEN in .dev.vars with your own local-only secret.
npm run dev:full
```

Wrangler serves static assets and the four API endpoints at `http://127.0.0.1:8787`.
Astro's standalone `npm run dev` serves only frontend files. Both local migration
and dev commands use the existing local-only sentinel DB binding. The migration
must run before the first API read. Never commit `.dev.vars` or put the token in
frontend environment variables. An absent/empty write token yields JSON 503; invalid
bearer credentials yield JSON 401. Reads remain public.

For separately authorized production preparation, the required bindings are `ASSETS`,
a migrated D1 database as `DB`, and the secret `API_WRITE_TOKEN`. This task neither
changes the sentinel configuration nor creates or deploys those resources.

## Consumer integration

- Frontend: GET `/api/posts?limit=20`, append `data.posts`, and send `data.next_cursor`
  unchanged on subsequent requests. GET `/api/posts/:id` returns `data: Post`.
  Deleted/missing posts return 404. Same-origin reads need no token or CORS changes.
- Automation: supply every content field from `CreatePostInput` and an Authorization
  bearer header to POST. `201 created` and `200 duplicate` are both processed
  successes. Duplicates return the existing content without changing it. Use exact,
  stable `source` and `source_item_id` values, including a monthly ID for changelogs.
- DELETE is authenticated, accepts no query or body, and is idempotent. Its original
  timestamp and occupied duplicate keys survive subsequent retries. Authenticated
  duplicate responses may include tombstones; public GET responses never do.
- Preview/embed/references are structured JSON data. Text/Markdown is untrusted;
  the frontend must escape/sanitize it and use allowlisted embed renderers.

## Storage and correctness

The first migration creates a strict `posts` table, global canonical URL uniqueness,
case-sensitive source/item uniqueness, a partial index for visible chronological
reads, and triggers protecting identity, insertion ordering, and deletion timestamps.
Nullable duplicate keys never match. Uniqueness includes deleted rows.

POST uses a transactional D1 batch: targeted uniqueness conflicts do nothing, then
an indexed lookup returns the matching existing record. Two different matching
records produce validation failure without merging or writing content. Other database
errors remain failures. DELETE uses a single atomic update with `RETURNING`.

Versioned base64url cursors validate their exact shape, UUID and normalized UTC time.
A strict tuple predicate and `limit + 1` query handle ties and detect the next page.
This is keyset pagination, not a frozen snapshot. Newer content appears on refresh;
deletions can shrink later pages. SQL parameters are bound, never interpolated.

Body reads enforce 256 KiB of encoded bytes even without a reliable Content-Length.
Authentication precedes validation or D1 access, with native Web Crypto HMAC
verification for timing-safe credential comparison. Errors never expose SQL or secrets.

## Validation

```sh
npm run validate
node --test tests/backend.integration.test.ts
npm run build
```

The backend integration suite creates an isolated temporary local Wrangler config,
applies migrations with `--local` twice, starts a real local Worker HTTP server and
D1 binding, tests schema/indexes, CRUD, concurrency, all kinds, pagination and failures,
and removes its temporary storage. It strips Cloudflare credentials and explicitly
disables remote bindings. No production credentials or database are needed.
`npm test` keeps the existing shared contract tests and updated Worker unit tests;
`npm run test:smoke` keeps the existing credential-free Foundation build test.

## Contract limitation and Free compatibility

INT-001 removes known tracking parameters (`utm_*`, `fbclid`, `gclid`, `dclid`,
`msclkid`, `mc_cid`, `mc_eid`) through the shared normalization helper. Content keys,
encoding/order, original URLs, paths, case and trailing slashes remain intact.
Provider IDs are usable through the exact `(source, source_item_id)`
key; this backend never infers IDs from embeds or follows redirects. It never deduplicates
by event, title, or body. URL-less posts with no source item ID have no retry identity.

The implementation uses only existing Free-compatible Worker, Assets and D1 bindings;
no paid services or new infrastructure. Each API request uses at most two D1 statements.
Indexed reads and bounded inputs support the existing Free-tier posture. Capacity still
depends on daily quotas, database size, response size and CPU limits. See Cloudflare's
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
D1's [batch transaction semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
support the atomic duplicate handling. Database failures use sanitized JSON 500;
a missing binding or unconfigured write secret uses JSON 503. Platform-generated
errors remain outside the application's response-envelope guarantee.
