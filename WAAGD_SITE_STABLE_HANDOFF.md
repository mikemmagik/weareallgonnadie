# WAAGD site — stable handoff

## Release identity

- **Stable version:** `v0.1.0`.
- **Application merge baseline on `main`:** `04226cc9b70ccccceb2ab8dfd8dfe1c40c9b7bf6`
  (`Merge pull request #1 from mikemmagik/sprint-6-site-integration`).
- **Release tag:** `v0.1.0`, created from the verified `main` release record.
- **Compatible Discovery release:**
  `waagd-discovery@f1c77662b32983d2f2732bf311e699f899a0ce6c`.

The stable tag contains the same application code as the merge baseline plus this
handoff record and the `main` CI trigger correction; it contains no deployment
configuration or credential.

## Verification

- `npm run validate` passed: 98 contract, security, unit, and local Worker/D1
  integration checks.
- The actual pinned Python Discovery producer completed the end-to-end path:
  `producer → validatePublicationIntent → Discovery ingress → Publisher → local
Worker/D1 → frontend parser` (42 Worker/D1 integration tests).
- Independent regression acceptance passed: 6/6.
- GitHub Actions must be green for the tagged `main` commit before staging use.
  The release workflow is now triggered for both `main` and the Sprint 6 branch.

## Delivered behavior

- One trusted `Publisher` and one canonical `PublicationIntent v1`; no
  JournalPublisher or competing ingress was introduced.
- Discovery retains its verified editorial path and its separate ingress secret.
- The existing OpenClaw Telegram ingress calls the URL-only adapter directly.
  An allowlisted numeric owner ID may send one or more public URLs; each URL is
  an independent, replay-safe submission and returns its result/permalink.
- Telegram attachment uploads are rejected safely. Videos are never downloaded;
  existing embeds and fallback cards are used. R2, upload endpoints and media
  storage are not in the current scope.
- `/pause auto` blocks automatic queued and replayed delivery but does not block
  authorized Telegram URL submissions. The retired project poller plugin is
  absent; the guarded legacy CLI poller is not for `@waagd_bot`.
- Worker/D1 and the frontend feed remain the single website path.

## Staging and migrations

- **Cloudflare staging:** not deployed or configured by this release. Live
  OpenClaw, Cloudflare/DNS and production remain untouched.
- Apply the repository D1 migrations through the normal staging operator
  procedure, with staging-only credentials supplied outside Git, logs and LLM
  context. Then execute the documented staging acceptance against a disposable
  test post and verify rollback before any production decision.
- No migration is run by GitHub Actions or by creating this release.

## Upgrade and rollback

1. Check out the `v0.1.0` tag and run `npm ci` followed by `npm run validate`.
2. Configure secrets only in the approved staging secret store; set the numeric
   Telegram owner allowlist and the separate Discovery ingress secret there.
3. For a rollback, redeploy the previously verified site revision through the
   normal operator-controlled platform process. Do not alter D1 data manually;
   use a tested migration rollback plan or restore procedure first.

## Branch inventory and cleanup rule

- `main` is retained and carries the stable release.
- **Deleted branches:** none. The audit found active local worktrees for the
  merged historical branches and the original Sprint 6 worktree still carries
  user-owned unstaged document deletions. Remote branch deletion would make
  that live work harder to recover, so it is deliberately deferred.
- **Merged but retained active branches:**
  `feat/automation`, `feat/backend`, `feat/frontend`, `feat/legal-disclaimer`,
  `fix/final-media`, `fix/firefox-focus`, `fix/legacy-tiktok`,
  `fix/media-qa-001`, `fix/media-ux-001`, `fix/qa-001`,
  `fix/reddit-compact`, `integration/mvp`, `integration/release-candidate`,
  `qa/final-rc`, `qa/media-fix-002`, `qa/media-fix-003`,
  `qa/media-polish-001`, `qa/media-ux-001`, `qa/mvp`,
  `qa/regression-001`, `qa/release-candidate`, and
  `sprint-6-site-integration`.
- **Unmerged and retained:** `codex/sprint6-publication-intent-v1` and
  `codex/sprint6-site-e2e`. They contain the alternative JournalPublisher-era
  history, so they are intentionally not part of the stable implementation and
  are retained rather than destroyed pending a separately authorized archival
  decision.
- A future cleanup may remove a remote branch only after its exact tip is an
  ancestor of `main`, it has no active worktree, open pull request, release tag
  or deployment dependency, and it contributes no unique reachable commit.

## Production blockers

1. Operator-run staging acceptance with real staging credentials.
2. Confirmation that the existing `@waagd_bot` OpenClaw ingress emits the
   documented event shape and can reply to the owner; this release does not
   modify the real integration.
3. A reviewed D1 backup/rollback plan and operator approval for any production
   deployment.

## Preserved user changes

Five pre-existing, unstaged document deletions in the original working tree
were not staged, committed, restored or included in the release. Their
provenance could not be proven safely, so they remain user-owned local work.
