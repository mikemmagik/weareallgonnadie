# Source and media polish QA

Date: 2026-10-21 (Asia/Bangkok)  
Site revision: `e9501a0`  
Staging Worker: `waagd-staging` version `19782463-4ee7-4598-962e-f8924df1fcf2`

## Scope and result

PASS for the scoped source-attribution and media presentation change. The
deployment contains fresh static assets and the existing Worker only. It does
not change `PublicationIntent v1`, D1 schema/data, Publisher policy,
OpenClaw, Telegram configuration, R2, DNS, or production.

`source` is now resolved from an exact, public URL host; `origin` remains the
ingress audit field. The resolver names the supported platforms only for their
exact host allowlists and gives other public sites a normalized domain name.
It therefore does not mistake `youtube.com.example` for YouTube. Redirect
destinations and a same-host, public canonical hint may refine attribution.
Cross-host, private, malformed, credentialed, and non-HTTP canonical hints are
ignored.

Legacy stored posts are not modified. At render time only, a legacy
`source=Telegram` record with a public original URL is relabelled from that URL.
The staging row `fd2434ea-9a24-4ad5-b69b-dd4e3c0ec85b` remains stored as
`source=Telegram`, `origin=telegram`, and renders as **Bangkok Post**.

## Checks

| Check                                                                                         | Result                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck, lint, formatting, unit, Worker/D1 integration and build smoke (`npm run validate`) | PASS — 106 passed, 1 explicitly skipped external Discovery-producer test                                                                                   |
| Deterministic source/metadata tests                                                           | PASS — Bangkok Post, unknown domains, exact-host anti-spoofing, redirect/canonical handling, OG/Twitter/title fallbacks, image URL policy, TikTok identity |
| Telegram/Pubisher safety tests                                                                | PASS — authorized owner, redelivery/deduplication, untrusted sender, media refusal, auto pause/replay boundaries                                           |
| Local WebKit UI (`npm run test:browser`)                                                      | PASS — 39 checks, including legacy Bangkok Post card attribution, full news body, consent gating, no autoplay and clickable fallbacks                      |
| Existing MEDIA-UX-001 platform regression                                                     | PASS in the repository regression suite — YouTube, Instagram, TikTok and Reddit provider layouts/identity checks remain covered                            |
| Remote D1 read after staging deploy                                                           | PASS — legacy row preserved; query reported zero writes                                                                                                    |
| Deployed Worker binding inspection                                                            | PASS — expected staging D1 binding and `API_WRITE_TOKEN` secret name only                                                                                  |

The staging origin remains correctly protected by Cloudflare Access. Its
unauthenticated response is an Access challenge; this is expected and is not
bypassed in QA.

## Rollback

The immediate Worker rollback target is
`51b64cc2-f5d9-4532-b9ef-d1f64acd6ac1`. No D1 migration was run, so no D1
rollback is required. See
[the staging operator packet](staging-telegram-operator.md) for the
staging-only rollback command and the single Access-authorized visual check.

## Remaining third-party limits

- Provider availability is controlled by YouTube, Instagram, TikTok and Reddit.
  A blocked, removed, private, geo-restricted, or unsupported item remains a
  safe original-link fallback; the site does not proxy it.
- External images and embeds load only after the existing session consent and
  never autoplay. No protected media URL, bot token, or other secret is exposed.
- One Access-authorized operator should visually open the existing Bangkok Post
  permalink after this deploy. No new Telegram message, OpenClaw restart, or
  D1 edit is needed for that confirmation.
