import { Api } from './core/api.ts';
import { Publisher, State } from './core/state.ts';
import { configuration, loadSources } from './config.ts';
import { OpenClawAI } from './openclaw/ai.ts';
import { runDiscovery } from './discovery/run.ts';
import { runChangelog, previousMonth } from './changelog/run.ts';
import {
  assertPublishImportOrigin,
  parsePublishImportArguments,
  publishImport,
  publishImportExitCode,
  readIngressTokenFile,
} from './discovery/file-import.ts';
import { pollTelegram } from './telegram/poll.ts';

async function runPublishImport(): Promise<number> {
  try {
    const args = parsePublishImportArguments(process.argv.slice(3));
    const config = configuration();
    assertPublishImportOrigin(
      config.apiOrigin,
      process.env.WAAGD_ALLOW_PRODUCTION_PUBLISH_IMPORT === 'true',
    );
    const ingressToken = await readIngressTokenFile(args.ingressTokenFile);
    const publisher = new Publisher(
      new Api(config.apiOrigin, config.token, fetch, undefined, config.access),
      new State(config.stateDir),
      { discoveryIngressToken: ingressToken },
    );
    const outcome = await publishImport(publisher, args, ingressToken);
    console.log(JSON.stringify(outcome));
    return publishImportExitCode(outcome);
  } catch {
    // Deliberately do not include file paths, intent content, or credentials.
    console.log(JSON.stringify({ outcome: 'failed' }));
    return 1;
  }
}

async function main() {
  const command = process.argv[2];
  if (command === 'publish-import') {
    process.exitCode = await runPublishImport();
    return;
  }
  const config = configuration();
  const publisher = new Publisher(
    new Api(config.apiOrigin, config.token, fetch, undefined, config.access),
    new State(config.stateDir),
    { discoveryIngressToken: config.discoveryIngressToken },
  );
  const ai = new OpenClawAI(config.openclaw, config.agent);
  if (command === 'telegram') {
    if (!config.legacyTelegramPollerEnabled)
      throw new Error(
        'Legacy Telegram polling is disabled. Use the existing OpenClaw delivery integration, or explicitly set WAAGD_ENABLE_LEGACY_TELEGRAM_POLLER=true for a compatibility test with one confirmed polling owner.',
      );
    const controller = new AbortController();
    process.once('SIGINT', () => controller.abort());
    process.once('SIGTERM', () => controller.abort());
    await pollTelegram(
      publisher,
      config.allowedIds,
      config.botToken,
      controller.signal,
    );
    return;
  }
  if (command === 'daily') {
    if (!config.legacyDailyEnabled)
      throw new Error(
        'Legacy daily discovery is disabled. WAAGD Discovery is the automatic source; set WAAGD_ENABLE_LEGACY_DAILY=true only for controlled compatibility testing.',
      );
    console.log(
      JSON.stringify(
        await runDiscovery(
          publisher,
          ai,
          await loadSources(process.env.WAAGD_SOURCES_FILE),
        ),
      ),
    );
    return;
  }
  if (command === 'monthly') {
    console.log(
      JSON.stringify(
        await runChangelog(
          publisher,
          ai,
          process.argv[3] ?? previousMonth(new Date(), config.timezone),
          config.timezone,
        ),
      ),
    );
    return;
  }
  if (command === 'retry') {
    console.log(
      JSON.stringify(
        await publisher.state.locked('replay', () => publisher.replay()),
      ),
    );
    return;
  }
  if (command === 'policy') {
    const origin = process.argv[3];
    const action = process.argv[4];
    if (
      (origin !== 'auto' && origin !== 'telegram') ||
      (action !== 'pause' && action !== 'resume')
    )
      throw new Error('Usage: policy <auto|telegram> <pause|resume>');
    await publisher.setPaused(origin, action === 'pause');
    console.log(JSON.stringify({ origin, paused: action === 'pause' }));
    return;
  }
  throw new Error(
    'Usage: node automation/cli.ts telegram|daily|monthly [YYYY-MM]|retry|policy <auto|telegram> <pause|resume>|publish-import --intent-file ABSOLUTE_PATH --ingress-token-file ABSOLUTE_PATH',
  );
}
main().catch(() => {
  console.error(
    'Automation failed. Check configuration, API availability, local state and OpenClaw compatibility. No success is implied.',
  );
  process.exitCode = 1;
});
