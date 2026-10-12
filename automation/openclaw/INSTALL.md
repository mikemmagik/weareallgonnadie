# Manual OpenClaw integration

These are installation templates, not an installer. No commands here were executed
against the user's live setup. Preserve current agents, bot accounts, bindings,
model subscriptions and schedules. Check project-name collisions before creating anything.

INT-001 assessment: the owner confirmed OpenClaw is not installed on this Mac.
The adapter flags and plugin entry match current official documentation, and mocked
CLI/API tests pass, but actual installation SDK/runtime compatibility remains unverified.
Keep the plugin as the primary lifecycle owner for Telegram: its child poller is an
internal process supervised by the existing Gateway, requiring no extra service
manager or AI subscription. Manual submissions call no model. Standalone CLI polling
is an optional diagnostic mode; never run both owners for the same bot.

## 1. Check installed compatibility

At integration time:

```sh
openclaw --version
openclaw agents add --help
openclaw agent --help
openclaw plugins install --help
openclaw plugins inspect --help
openclaw automations create --help
```

The adapter needs `agent --agent --session-id --message-file --timeout --json`.
It handles final-text or payload-text JSON envelopes, including a Gateway `result`
wrapper. Unknown shapes fail closed. Verify a harmless JSON-only run before scheduling;
do not guess replacement fields or switch providers. No automatic CLI/model retry
is performed after uncertain completion.

The plugin needs `definePluginEntry`, `api.registerService`, TypeScript loading,
manifest `activation.onStartup` and Node 24 in the Gateway process. Schedule templates
need native command jobs with exact argv. If installed mechanisms differ, leave
integration unconfigured and use that version's documented migration/support path.

Official references reviewed 2026-10-12:

- [Agent CLI](https://docs.openclaw.ai/cli/agent)
- [Dedicated agents/workspaces](https://docs.openclaw.ai/cli/agents)
- [Plugin entry helper](https://docs.openclaw.ai/plugins/sdk-entrypoints/define-plugin-entry)
- [Background service registration](https://docs.openclaw.ai/plugins/sdk-overview/infrastructure)
- [Plugin activation](https://docs.openclaw.ai/plugins/manifest/capabilities)
- [Plugin discovery](https://docs.openclaw.ai/plugins/manifest/package-json)
- [Plugin installation](https://docs.openclaw.ai/plugin)
- [Native command schedules](https://docs.openclaw.ai/cli/cron)

## 2. Dedicated editorial agent

Create a new workspace outside this repo. Use the installation's existing model and
subscription, without new provider credentials or a separate service. AI invocations
explicitly target the dedicated agent and use fresh sessions; no channel binding.

```sh
openclaw agents list
openclaw agents add waagd --workspace /absolute/private/waagd-workspace --non-interactive
```

Copy `workspace/AGENTS.md` into that new workspace after setup. Select the already
configured subscription model using the installed version's documented agent setup.
Confirm this agent's authentication profile can use the subscription: creation does
not guarantee automatic credential inheritance. Preserve defaults for current agents.

Restrict only this agent's tools to none using the installed version's per-agent tool
policy. This is an integration requirement, not a guessed JSON field. The agent only
needs supplied JSON to return JSON; the workspace prompt alone does not enforce tool
restrictions. Keep secrets outside the workspace. Fetching, writing and deletion
are performed by the application, never by this agent.

## 3. Separate deterministic Telegram service

Later the owner must register a dedicated bot and privately supply its token and
numeric allowed user IDs. Do not reuse a current channel's bot token. This bot must
have a single poller and no webhook; check that during integration. The implementation
does not modify webhook configuration.

The project plugin runs the Bot API poller as an OpenClaw background service. It
checks the actual trusted `message.from.id` before URL fetching or API operations.
Manual publication never enters a model turn. Keep this token outside `channels.telegram`
and do not create agent bindings for it; that would give it competing polling owners.
Current channel bots/agents remain intact. The standalone CLI is also available, but
only one owner may run the project poller.

After review and compatibility checks, link the complete checkout (the plugin depends
on the poller elsewhere under automation; do not copy its subdirectory alone):

```sh
openclaw plugins install --link /absolute/path/waagd-integration/automation/openclaw/plugin
openclaw plugins enable waagd-telegram
openclaw plugins inspect waagd-telegram --runtime --json
```

Review any trust prompt. Preserve all existing allowlist entries if `plugins.allow`
is configured. `config.example.json` illustrates only the new documented plugin
entry: merge it into existing configuration rather than replacing the configuration.
No secret plugin fields are supplied. Provide `WAAGD_*` through the Gateway service
owner's private environment; managed services need not inherit an interactive shell.
The Gateway Node executable must be Node 24.

Let the owner choose a suitable Gateway reload/restart window. Runtime inspection
is not proof that an already-running Gateway loaded the service. Verify with an
authorized test message against an implemented local/staging API. Five consecutive
poll failures stop the project service with a sanitized error; check configuration,
state and network, then restart the project service. No current agents are modified.

## 4. Native scheduling templates

Daily discovery: 09:00. Monthly: 09:15 on day 1, Asia/Bangkok. Monthly selects the
previous calendar month and source membership in the configured IANA timezone.
UTC insertion timestamps are converted into that timezone for membership; the
09:15 first-day run occurs after the local month has ended. The MacBook/Gateway must remain awake and online.

Replace absolute placeholders after creating a private environment file outside
Git and the agent workspace. Node's env-file argument contains a path, not credentials.

```sh
openclaw automations create '0 9 * * *' \
  --name waagd-daily --tz Asia/Bangkok \
  --command-argv '["/absolute/path/node","--env-file=/absolute/private/waagd.env","/absolute/path/waagd-integration/automation/cli.ts","daily"]' \
  --command-cwd /absolute/path/waagd-integration --timeout-seconds 600

openclaw automations create '15 9 1 * *' \
  --name waagd-monthly --tz Asia/Bangkok \
  --command-argv '["/absolute/path/node","--env-file=/absolute/private/waagd.env","/absolute/path/waagd-integration/automation/cli.ts","monthly"]' \
  --command-cwd /absolute/path/waagd-integration --timeout-seconds 600
```

Command jobs provide scheduling; the script invokes the dedicated existing agent
only when needed. Do not wrap these in an agent-turn job that recursively calls another
model turn. No Telegram delivery target is needed. Verify delivery defaults, job scope
and native run history in the installed version before enabling.

Optionally create an hourly command job for `retry` with the same paths/env/cwd, or
run it manually after network recovery. Monthly retries require `monthly YYYY-MM`.
Recover missed first-day runs explicitly with the intended month instead of assuming
scheduler catch-up semantics. Inspect failure summaries and stale locks after deadlines.

## 5. Remaining manual integration checks

1. Backend, migrated D1, authentication, tombstone duplicates, cursor pagination and
   frontend permalinks must be available at the configured API origin. INT-001 verifies
   this locally; production provisioning remains a manual prerequisite.
2. Dedicated agent returns valid JSON using the existing subscription, with tools
   disabled. Check envelope compatibility, translation, citations and factual restraint.
3. Private environment/state are accessible only to service owner; no production secrets
   are in this repository or workspace.
4. New bot has one poller; authorized users publish; other users/groups cannot.
5. Same URL twice gives PUBLISHED then ALREADY EXISTS with the same ID. Unsupported
   public embeds have link cards.
6. `/delete <id>` deletes immediately; resubmission remains a tombstone duplicate.
7. Empty daily selection publishes nothing; unrelated negative stories and unsupported
   serious claims are rejected by the editorial agent.
8. Generate a prior-month digest from website posts only; rerunning is idempotent.
   Simulate temporary API failure and recover the identical saved draft.
9. Confirm timezone, schedules, Gateway/laptop uptime, native job history, outgoing
   retry limits and stale-lock recovery. Verify current agents/bots still behave normally.

Mocked tests do not claim live end-to-end verification. No real bot, new subscription,
production secret, OpenClaw configuration change or deployment is required for local
validation of this checkout.
