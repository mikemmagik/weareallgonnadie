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
- `sprint-6-site-integration` is the fully merged delivery branch and may be
  removed remotely only after the tag and this release record are verified.
- Historical feature/fix/QA branches are removed only when their exact tips are
  ancestors of `main`, have no active pull request or deployment dependency, and
  contribute no unique reachable commit. Local worktrees are never deleted by
  this cleanup.
- The alternative `codex/sprint6-publication-intent-v1` is not the release
  implementation and is considered only under that same ancestry proof.

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
