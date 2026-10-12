# API contract — version 1

`shared/contracts.ts` is the source of truth for wire types and duplicate URL
normalization. INT-001 integrates the implemented Worker, static frontend and HTTP
automation clients. All four documented operations work locally with migrated D1;
unknown API paths return JSON 404 and unsupported methods return 405 with Allow.
The wire schema, cursor version, reference limit, authentication and tombstone
semantics retain version 1. The coordinated tracking normalization change is below.

## JSON conventions

Base path: `/api`. Requests and responses use UTF-8 JSON. Successes are
`{ "ok": true, "data": ... }`. Failures are
`{ "ok": false, "error": { "code": "...", "message": "...", "details": [...] } }`.
`details` is optional and contains `{path, message}` validation issues. Never expose
stack traces, SQL, secret values, or raw upstream errors. All API responses use
`Content-Type: application/json; charset=utf-8` and `Cache-Control: no-store` initially.

Successful Post objects always include every modeled field. Nullable metadata must
be explicitly `null`; references without entries must be `[]`. POST input includes
all content fields, including nullable fields, but excludes server-owned fields.
Unknown input fields are rejected, including nested metadata and server-owned fields.

## Post schema

| Field            | Type           | Rules                                                                                          |
| ---------------- | -------------- | ---------------------------------------------------------------------------------------------- |
| `id`             | string         | Server-generated lowercase UUID v4; immutable                                                  |
| `url`            | string or null | Original absolute HTTP(S) URL; required for news/video/meme, nullable for changelog            |
| `canonical_url`  | string or null | Input hint; backend normalizes this or original URL for deduplication; null for URL-less posts |
| `source_item_id` | string or null | Stable ID within the exact source namespace; max 256 characters                                |
| `title`          | string         | Non-empty text, max 300 characters                                                             |
| `source`         | string         | Non-empty stable source label/namespace, max 100 characters; case-sensitive                    |
| `type`           | enum           | `news`, `video`, `meme`, `changelog`                                                           |
| `origin`         | enum           | `auto`, `telegram`; provenance, never authorization                                            |
| `preview`        | object or null | `{image_url: string, alt_text: string or null}`                                                |
| `embed`          | object or null | Provider metadata or fallback link below                                                       |
| `body`           | string or null | Plain text/Markdown, max 100,000 characters; non-empty for changelog                           |
| `references`     | array          | Up to 100 `{url: string, title: string or null}` objects                                       |
| `published_at`   | string         | Server insertion time, immutable UTC `YYYY-MM-DDTHH:mm:ss.sssZ`                                |
| `deleted_at`     | string or null | Server UTC soft-deletion time; null while visible                                              |

Regular content aggregates a source and requires a valid original URL even when
an embed is supplied. Changelogs require their own non-whitespace body, may have no
external URL, and can cite source references. `canonical_url` must be null when `url`
is null. Source publication dates do not control feed ordering. Clients cannot set
`id`, `published_at` or `deleted_at`.

All URL fields accept only absolute HTTP(S) URLs, max 2,048 characters, without
embedded credentials or surrounding whitespace. Other text fields require at least
one non-whitespace character unless null is allowed. Preview alt text, reference
labels and link labels are at most 300 characters. Null is not equivalent to a missing
field. Length limits use JavaScript string length (UTF-16 code units). A request body
is limited separately to **256 KiB of encoded bytes**; reject before parsing an
oversized request, including requests without a reliable Content-Length header.

Text/Markdown is untrusted content: preserve as data and escape at render time. No raw
HTML execution is allowed. URL validation alone is not SSRF protection or permission
for the backend to fetch arbitrary sources.

## Embedded content and fallback

```json
{
  "kind": "provider",
  "provider": "youtube",
  "id": "video_123",
  "url": "https://youtu.be/video_123"
}
```

Supported metadata providers: `youtube`, `reddit`, `tiktok`, `instagram`. `id` is
non-empty, at most 256 characters, using letters, digits, underscore, slash or hyphen.
The renderer must still validate the provider-specific ID/path before constructing
an allowlisted embed; recognized metadata does not promise renderability. It must
never use arbitrary iframe sources or HTML supplied by a client.

Allowed source hostnames are exact matches:

| Provider  | Hostnames                                                              |
| --------- | ---------------------------------------------------------------------- |
| youtube   | youtube.com, www.youtube.com, m.youtube.com, youtu.be                  |
| reddit    | reddit.com, www.reddit.com, old.reddit.com, redd.it                    |
| tiktok    | tiktok.com, www.tiktok.com, m.tiktok.com, vm.tiktok.com, vt.tiktok.com |
| instagram | instagram.com, www.instagram.com                                       |

Unknown providers must use a fallback link, not arbitrary provider metadata:

```json
{
  "kind": "link",
  "url": "https://example.com/content",
  "label": "Open original"
}
```

`label` may be null. `embed: null` means no requested embed; the original post URL is
still available as the fallback. Blocked, removed, unsupported, or unavailable embeds
must display a safe source link instead. Render link text escaped and use
`rel="noopener noreferrer"` on new-tab external links. The frontend constructs allowlisted HTTPS players, loads them only on click,
and uses iframe sandbox and autoplay-denying permissions. Deployment CSP must permit
only the documented player origins; see the frontend guide.

## Authentication

Reads are public. POST and DELETE require `Authorization: Bearer <API_WRITE_TOKEN>`
over HTTPS in production. Local loopback HTTP is allowed for development only.
The backend authenticates before parsing submission content or accessing
D1, uses a timing-safe credential check, and fails closed when the secret is missing
(`503 SERVICE_UNAVAILABLE`). Missing or invalid credentials return `401 UNAUTHORIZED`
with `WWW-Authenticate: Bearer`. Keep tokens out of URLs, logs, Git and frontend
bundles. No visitor accounts or cookies are required. Same-origin browser reads need
no permissive CORS; external automation is a server-to-server HTTP client.

The integrated backend implements authentication. No recognized endpoint remains a 501 scaffold.

## GET /api/posts

Optional query parameters: `limit` (integer 1–100, default 20) and `cursor` (opaque,
URL-safe string, maximum 1,024 characters). Reject invalid limits, repeated parameters
and unknown parameters with `400 VALIDATION_ERROR`; reject malformed, unsupported or
invalid cursor contents with `400 INVALID_CURSOR`. Never accept SQL from a cursor.

Visible posts only (`deleted_at IS NULL`), ordered by
`published_at DESC, id DESC` using binary lexical UUID comparison. Publication times
and IDs never change. Query subsequent pages with the strict tuple predicate:

```sql
published_at < :cursor_time
OR (published_at = :cursor_time AND id < :cursor_id)
```

The cursor encodes base64url UTF-8 JSON
`{ "v": 1, "published_at": "2026-10-12T12:00:00.000Z", "id": "<UUID>" }`
without padding. Validate its version, normalized UTC timestamp and lowercase UUID v4.
It is opaque to clients, not encrypted, a credential, or a signature. It need not
reference a row still visible in the database. Fetch `limit + 1` rows to determine
whether more exist; next_cursor is built from the last returned row or null at the end.

Stable ordering prevents equal-timestamp duplicates between pages. New insertions
before the cursor appear on a fresh first-page request. Deletions may shrink later
pages; this is keyset pagination, not snapshot isolation.

```sh
curl 'http://127.0.0.1:8787/api/posts?limit=20'
# The next request passes the returned cursor unchanged, URL encoded if necessary.
curl 'http://127.0.0.1:8787/api/posts?limit=20&cursor=RETURNED_CURSOR'
```

Example `200` response for an empty feed:

```json
{ "ok": true, "data": { "posts": [], "next_cursor": null } }
```

A non-empty page contains complete Post objects in `data.posts` using the schema in
the response below. `next_cursor` is null or the versioned cursor string.

## GET /api/posts/:id

Returns `200 {ok:true,data:Post}` for a visible post. Malformed UUIDs return
`400 VALIDATION_ERROR`. Missing or soft-deleted posts return `404 NOT_FOUND`; do not
expose a tombstone through public reads. Public reads do not require a token.
The same homepage uses this endpoint for `/?post=<id>` publication permalinks,
including posts outside its first feed page. Telegram and monthly references link to
that readable URL rather than to the JSON endpoint.

```sh
curl http://127.0.0.1:8787/api/posts/5bdac05a-6f04-4bb9-a7d7-c08530c4fb12
```

## POST /api/posts

Require bearer authentication and `Content-Type: application/json` (UTF-8 charset
parameter permitted). Validate all content fields. Create a UUID, insertion timestamp
and null deletion timestamp on the backend. No external fetching is required.

```sh
curl -X POST http://127.0.0.1:8787/api/posts \
  -H "Authorization: Bearer $API_WRITE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"url":"https://example.com/news","canonical_url":null,"source_item_id":"news-123","title":"Robots request a day off","source":"Example News","type":"news","origin":"telegram","preview":null,"embed":{"kind":"link","url":"https://example.com/news","label":null},"body":null,"references":[]}'
```

`$API_WRITE_TOKEN` is a local environment value, not a real committed token. Telegram
origin records the already approved manual submission; no second editorial gate.

Example **201 Created** response:

```json
{
  "ok": true,
  "data": {
    "outcome": "created",
    "post": {
      "id": "5bdac05a-6f04-4bb9-a7d7-c08530c4fb12",
      "url": "https://example.com/news",
      "canonical_url": "https://example.com/news",
      "source_item_id": "news-123",
      "title": "Robots request a day off",
      "source": "Example News",
      "type": "news",
      "origin": "telegram",
      "preview": null,
      "embed": {
        "kind": "link",
        "url": "https://example.com/news",
        "label": null
      },
      "body": null,
      "references": [],
      "published_at": "2026-10-12T12:00:00.000Z",
      "deleted_at": null
    }
  }
}
```

Also return `Location: /api/posts/<id>` on creation. `GET /api/posts/:id` returns the
same complete post directly inside `data`, without the creation outcome wrapper.

Example URL-less changelog input:

```json
{
  "url": null,
  "canonical_url": null,
  "source_item_id": "humanity-changelog:2026-10",
  "title": "Humanity Changelog — October 2026",
  "source": "We Are All Gonna Die",
  "type": "changelog",
  "origin": "auto",
  "preview": null,
  "embed": null,
  "body": "## Humanity Changelog\nStill here. Details to follow.",
  "references": [{ "url": "https://example.com/news", "title": "Reference" }]
}
```

### Duplicate detection is a successful submission

Normalize `canonical_url ?? url` with the standard URL parser, lowercase host/scheme,
remove fragments and default ports, and serialize with `URL.toString()`. Remove case-insensitive `utm_*` parameters and exactly `fbclid`, `gclid`, `dclid`,
`msclkid`, `mc_cid`, `mc_eid`. Decode parameter names for recognition; preserve all
other query components, original encoding and ordering. Keep `v`, `list`, `id`, `ref`,
signature/access parameters and unknown keys. Preserve path case and trailing-slash
semantics. For example, `?v=abc&utm_source=telegram` and `?v=abc&fbclid=123` share
identity, while `?v=def` remains distinct. This INT-001 semantic refinement is
implemented once in `normalizePublicationUrl` and used by backend and automation. Do not follow
redirects or infer provider-specific equivalence in this phase. If no URL exists,
canonical_url remains null. The regular response stores the normalized canonical URL
while preserving the original `url` field.

A submission is duplicate if its non-null normalized canonical URL or its non-null
`(source, source_item_id)` matches an existing record. Null keys do not match. Enforce
uniqueness atomically in D1, including concurrent requests, with database constraints;
a read-before-write check alone is insufficient. If both keys match the same post,
report `matched_by: "canonical_url"`. If they point at different records, return
`400 VALIDATION_ERROR` for conflicting identifiers; never merge records implicitly.

A duplicate returns **200 OK**, `ok: true`, `outcome: "duplicate"`, the complete
existing Post and `matched_by` (`canonical_url` or `source_item_id`). It does not change
content, origin, insertion time or deletion state. Example response:

```json
{
  "ok": true,
  "data": {
    "outcome": "duplicate",
    "matched_by": "source_item_id",
    "post": {
      "id": "5bdac05a-6f04-4bb9-a7d7-c08530c4fb12",
      "url": "https://example.com/news",
      "canonical_url": "https://example.com/news",
      "source_item_id": "news-123",
      "title": "Robots request a day off",
      "source": "Example News",
      "type": "news",
      "origin": "telegram",
      "preview": null,
      "embed": {
        "kind": "link",
        "url": "https://example.com/news",
        "label": null
      },
      "body": null,
      "references": [],
      "published_at": "2026-10-12T12:00:00.000Z",
      "deleted_at": null
    }
  }
}
```

A soft-deleted match also returns a duplicate with its original non-null deleted_at
and does not resurrect content. This tombstone response is available only to an
authenticated writer. Automation marks duplicates as processed and does not retry
them as failures. URL-less changelogs should use a stable monthly source_item_id;
without either duplicate key repeated submissions cannot be recognized as duplicates.

A failed submission has `ok: false` and an appropriate 4xx/5xx error. No successful
publication is implied. Automation retries transport failures and `408`, `429`,
`500`, `502`, `503`, `504` with bounded
backoff and jitter, respecting Retry-After when present; the same keys protect against
an uncertain previously committed write. Do not automatically retry validation/auth
errors or `501`; fix the input/configuration or wait for implementation.

FIX-001 does not change contract v1 URL acceptance or provider metadata shapes.
Automation uses a checked resolved URL for TikTok embed metadata while preserving
original `url` and canonical identity. Ingestion/rendering suppress previews that
fail the public HTTPS preview policy; API URL validation alone does not authorize
fetching or rendering a private image target. Confirmed original 404/410 stops manual
preparation before POST; uncertainty/optional metadata failure retains human approval.

## DELETE /api/posts/:id

Require bearer authentication. Set deleted_at once; retain the row and duplicate keys.
No hard-delete endpoint is exposed. A repeated DELETE returns the existing deletion
timestamp (idempotent); a never-existing ID returns `404 NOT_FOUND`. Invalid UUIDs
return `400 VALIDATION_ERROR`. No request body or query parameters are accepted.

```sh
curl -X DELETE \
  -H "Authorization: Bearer $API_WRITE_TOKEN" \
  http://127.0.0.1:8787/api/posts/5bdac05a-6f04-4bb9-a7d7-c08530c4fb12
```

`200` response:

```json
{
  "ok": true,
  "data": {
    "id": "5bdac05a-6f04-4bb9-a7d7-c08530c4fb12",
    "deleted_at": "2026-10-12T12:30:00.000Z"
  }
}
```

## Error behavior

| HTTP | Code                   | Meaning                                                                      |
| ---- | ---------------------- | ---------------------------------------------------------------------------- |
| 400  | INVALID_JSON           | Request body is not valid JSON                                               |
| 400  | VALIDATION_ERROR       | Wrong fields, types, lengths, UUID, query values, or conflicting identifiers |
| 400  | INVALID_CURSOR         | Invalid cursor encoding, version or contents                                 |
| 401  | UNAUTHORIZED           | Missing or invalid bearer credential                                         |
| 404  | NOT_FOUND              | Unknown route or invisible/nonexistent post                                  |
| 405  | METHOD_NOT_ALLOWED     | Unsupported method; include Allow                                            |
| 413  | PAYLOAD_TOO_LARGE      | Encoded body exceeds 256 KiB                                                 |
| 415  | UNSUPPORTED_MEDIA_TYPE | POST body is not application/json                                            |
| 429  | RATE_LIMITED           | Temporary throttling; include Retry-After when known                         |
| 500  | INTERNAL_ERROR         | Unexpected backend failure; no internal detail                               |
| 503  | SERVICE_UNAVAILABLE    | Backend dependency unavailable or write secret unconfigured                  |
| 501  | NOT_IMPLEMENTED        | Reserved compatibility error; no integrated route returns it                 |

Validation example:

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid publication.",
    "details": [
      {
        "path": "url",
        "message": "Expected an absolute HTTP(S) URL without credentials."
      }
    ]
  }
}
```

Historical scaffold example (not returned by the integrated routes):

```json
{
  "ok": false,
  "error": {
    "code": "NOT_IMPLEMENTED",
    "message": "This endpoint is reserved; implementation is pending."
  }
}
```

Authentication failures precede content validation for recognized write routes.
Unknown API routes always stay JSON and must not fall through to HTML assets.
Platform-generated limits/errors outside the Worker are not guaranteed to use this
application envelope; clients must handle non-JSON transport responses safely.
