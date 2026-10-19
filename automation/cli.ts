import { Api } from './core/api.ts';
import { Publisher, State } from './core/state.ts';
import { configuration, loadSources } from './config.ts';
import { OpenClawAI } from './openclaw/ai.ts';
import { runDiscovery } from './discovery/run.ts';
import { runChangelog, previousMonth } from './changelog/run.ts';
import { pollTelegram } from './telegram/poll.ts';

async function main() {
  const config = configuration();
  const publisher = new Publisher(
    new Api(config.apiOrigin, config.token),
    new State(config.stateDir),
  );
  const ai = new OpenClawAI(config.openclaw, config.agent);
  const command = process.argv[2];
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
  throw new Error(
    'Usage: node automation/cli.ts telegram|daily|monthly [YYYY-MM]|retry',
  );
}
main().catch(() => {
  console.error(
    'Automation failed. Check configuration, API availability, local state and OpenClaw compatibility. No success is implied.',
  );
  process.exitCode = 1;
});
