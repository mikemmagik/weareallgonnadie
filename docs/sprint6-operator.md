# Sprint 6 automation interface

The website automation accepts one fixed private state file,
`publication-intents.json`, from WAAGD Discovery. Run
`node --env-file=/absolute/private/site.env automation/cli.ts publish-import`.
The parser accepts only the versioned discovery envelope, up to 100 verified-auto
intents, and recomputes each digest before the bearer-token journal can make a
request. Re-running it is safe: published journal identities return the same result
without a second POST.

`WAAGD_SPRINT6_PUBLISHING_ENABLED` defaults to `0`; set it to `1` only for the
approved staging run. The state directory remains an owned `0700` directory outside
the repository and each file is atomically written `0600`.

Set `WAAGD_SPRINT6_TELEGRAM_WORKFLOW_ENABLED=1` to replace the legacy direct URL
path with the owner preview/publish workflow. It runs only for configured private
numeric owner IDs. It passes a bounded request to the existing `waagd` Gateway agent
with an allowlisted environment. Site and Telegram credentials are removed from that
child. The Gateway agent must be configured tool-free by the operator; any reported
tool call fails closed. Details and the cross-repository staging sequence are in
the Discovery repository's `docs/SPRINT_6_OPERATOR.md`.
