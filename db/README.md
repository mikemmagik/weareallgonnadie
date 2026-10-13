# Publication database

`0001_posts.sql` stores all four publication kinds under the approved Post contract.
Original URLs, normalized canonical URLs, exact source/item IDs, metadata JSON,
changelog bodies/references, origin, insertion time and soft deletion are retained.

Unique partial indexes enforce non-null canonical URLs and non-null exact
`(source, source_item_id)` pairs across visible and deleted posts. They are the atomic
retry boundary. A separate partial index serves visible `(published_at DESC, id DESC)`
keyset pagination. Triggers protect identity/order and prevent clearing or replacing
an existing deletion timestamp. SQLite constraints protect core stored types and JSON;
shared input validation handles the full wire contract.

The unchanged Wrangler `DB` binding uses a non-production sentinel and `remote: false`.
Apply migrations to local D1 before starting the Worker:

```sh
npx wrangler d1 migrations apply DB --local
```

Run the isolated local migration, constraint and HTTP integration suite with:

```sh
node --test tests/backend.integration.test.ts
```

No production database has been created. Production bindings and migrations require
separately authorized deployment preparation. See [backend setup](../worker/README.md)
and [API semantics](../docs/api.md).
