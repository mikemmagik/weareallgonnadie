# Sprint 6 QA report

Date: 19 October 2026 (Asia/Bangkok). Candidate: local branch
`sprint-6-site-integration`.

## Result

**Finalization RC passed local verification.** `npm run validate` completed on this
branch: typecheck, lint, formatting, 95 unit/contract/automation/security tests,
credential-free static + Worker dry-run smoke, and 41 real local Worker/D1 entries.
No deployment was performed. The current contract, security review, updated
kill-switch/replay tests and combined staging procedure are recorded in
[`sprint-6-publication-intent-v1.md`](sprint-6-publication-intent-v1.md),
[`sprint-6-security-review.md`](sprint-6-security-review.md), and
[`sprint-6-staging-acceptance.md`](sprint-6-staging-acceptance.md). The new branch
workflow runs `npm run validate` plus the independent local regression acceptance on
push/PR, covering regression, security and Worker/D1 E2E without credentials.

The deterministic integration entry named `Sprint 6 intents and owner Telegram reach
real local Worker/D1` exercises both required write paths against the actual local
Worker and migrated D1:

1. Synthetic approved Discovery intent → trusted Publisher → authenticated Worker →
   D1 → readable post. It verifies article body/references, durable receipt behavior,
   and the auto kill switch.
2. Authorized private Telegram event → pure adapter → trusted Publisher →
   authenticated Worker → D1 → readable URL-less news post and confirmation. It
   verifies that auto pause does not block the owner path.

The frontend build and its unit/browser fixtures separately verify that the same post
schema renders complete escaped article paragraphs in the one chronological feed.

## Required scenario coverage

| Scenario                                | Evidence                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Idempotency and duplicate submission    | Worker/D1 atomic canonical/source-item tests; Publisher receipt replay; real local integration   |
| Malformed payload and missing API token | Contract/Worker tests and real Worker authenticated-write checks                                 |
| Unauthorized Telegram sender            | Adapter tests reject non-allowlisted, group, bot, malformed, and edited updates without requests |
| Network timeout/API failure/retry       | Existing bounded retry and durable outbox tests; failed submissions never claim success          |
| Unsupported media                       | Adapter returns an explicit unsupported-media response and does not publish or expose token URLs |
| Rollback and tombstones                 | Soft-delete and tombstone duplicate coverage; migration preserves tombstones and triggers        |
| Automatic kill switch                   | Publisher policy and real local intent test; Telegram text remains publishable                   |
| Text with no URL                        | Shared validator, D1 forward migration, Worker real round-trip, and Telegram adapter tests       |
| Full article rendering                  | Safe full-body paragraph renderer tests and static frontend build                                |

## Staging and live-service limits

No staging origin, staging token, or access to the existing `@waagd_bot`/OpenClaw
ingress was supplied to this checkout. Consequently, this report does not claim a
remote staging run, real Telegram confirmation, live provider playback, or a deployed
frontend. The staging checklist and rollback boundary are in
[`sprint-6-operator-guide.md`](sprint-6-operator-guide.md). Run it only with explicit
staging-only credentials and the current bot owner's involvement.

## Release gates still owned by the operator

- Connect WAAGD Discovery to the protected local Publisher handoff and leave legacy
  `daily` disabled.
- Connect the existing OpenClaw ingress to `TelegramSubmissionAdapter`; do not enable
  the legacy poller or create another bot.
- Approve an R2 design separately before accepting native Telegram file uploads.
- Perform staging E2E with staging credentials, then make any deployment/DNS decision
  in a separate authorized change.
