# Database boundary

Wrangler prepares the `DB` D1 binding with a non-production sentinel ID and `remote: false`.
No production database or schema has been created. `migrations/` is reserved for the
Backend agent after contract review. No ORM is required.

Future migrations must enforce uniqueness of non-null canonical URLs and non-null
`(source, source_item_id)` pairs, including soft-deleted records, and index the visible
feed for `(published_at DESC, id DESC)`. Persist timestamps in normalized UTC form.
See [API semantics](../docs/api.md) before designing the schema.

Only commands explicitly using `--local` may be used in foundation work. Running the
Worker locally simulates D1; it does not create remote resources.
