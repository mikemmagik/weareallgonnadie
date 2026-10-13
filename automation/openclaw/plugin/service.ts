import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Service logic can be tested without loading the installation's SDK.
interface PluginApi {
  registerService(service: {
    id: string;
    start(): void;
    stop(): Promise<void>;
  }): void;
  logger: { error(message: string): void };
}
export default function register(api: PluginApi): void {
  let child: ChildProcess | undefined;
  api.registerService({
    id: 'waagd-telegram-poller',
    start() {
      if (child) return;
      // No code or credentials are executed/read at plugin import/registration time.
      child = spawn(
        process.execPath,
        [fileURLToPath(new URL('../../cli.ts', import.meta.url)), 'telegram'],
        { stdio: 'ignore', env: process.env },
      );
      child.once('error', () => {
        child = undefined;
        api.logger.error('WAAGD Telegram process failed to start.');
      });
      child.once('exit', (code) => {
        child = undefined;
        if (code)
          api.logger.error(
            'WAAGD Telegram stopped. Check configuration and restart service.',
          );
      });
    },
    async stop() {
      const current = child;
      if (!current) return;
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => current.kill('SIGKILL'), 40_000);
        current.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
        current.kill('SIGTERM');
      });
      child = undefined;
    },
  });
}
