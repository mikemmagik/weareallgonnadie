# Sprint 6 site integration audit

Date: 19 October 2026 (Asia/Bangkok). Scope: the site repository only. No production,
staging, DNS, bot, Cloudflare Access, R2, or OpenClaw runtime was changed.

## Reused components

| Area                   | Reused capability                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Worker/D1              | Authenticated `POST /api/posts`, public reads, soft delete, immutable ordering, atomic canonical/source-item duplicate handling |
| Automation API         | HTTPS/loopback protection, bearer header handling, response validation, bounded transport retry                                 |
| Publisher state        | Private `0700`/`0600` state, atomic queued payloads, bounded replay, duplicate-as-success behavior                              |
| URL and media metadata | Safe public URL/redirect checks, allowlisted provider embed metadata, external link cards                                       |
| Frontend               | One chronological feed, escaped source/body text, references, provider autoplay policy                                          |

## Findings and disposition

| Finding                                                                                                                                                                         | Sprint 6 disposition                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `automation/discovery/run.ts` runs RSS/HN/USGS collection plus an AI title selector and publishes directly. It competes with WAAGD Discovery and does not create full articles. | Treat as disabled legacy compatibility code. Do not schedule it with WAAGD Discovery; remove only after staged intent-path acceptance. Keep generic Publisher/API/retry/state helpers. |
| The existing Telegram implementation owns a Bot API `getUpdates` poller.                                                                                                        | Do not run or auto-enable it for `@waagd_bot`. Use a pure adapter invoked by the existing OpenClaw inbound path.                                                                       |
| `CreatePostInput` previously required an URL for ordinary news.                                                                                                                 | A forward D1 migration and shared-contract extension allow only a source-identified, non-empty text-news bulletin without a URL.                                                       |
| Normal post body was visually clamped to a preview.                                                                                                                             | Regular news now renders full escaped text paragraphs; it does not turn Markdown/HTML into executable markup.                                                                          |
| Native Telegram files are outside the URL-submission product scope.                                                                                                             | Return an explicit unsupported-media outcome; no R2 design, binding, upload endpoint, or media store is planned.                                                                       |

## Coordinated contract decision

Sprint 6 retains a shared-contract expansion for existing source-identified text
bulletins. The Telegram owner workflow does not use it: Telegram submissions require
public URLs. `type: "news"` may have `url: null` only when all of these are true:

- `canonical_url`, `preview`, and `embed` are `null`;
- `body` is non-empty;
- `source_item_id` is non-null and stable in the source namespace.

`video` and `meme` still require a public HTTP(S) URL. Existing URL-bearing posts,
URL-less changelogs, API envelopes, status codes, pagination, soft deletion, and
duplicate semantics remain compatible. The forward migration preserves old rows,
tombstones, partial unique indexes, and immutable-identity/deletion triggers.

## Remaining external gates

The repository has no staging origin/token or access to the current bot ingress. An
operator must supply staging-only credentials and perform the documented ingress
handoff. The local deterministic E2E suite verifies the software boundary; it cannot
claim real Telegram delivery, existing OpenClaw compatibility, provider availability,
or an edge/staging deployment.
