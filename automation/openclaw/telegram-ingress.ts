import { configuration } from '../config.ts';
import { Api } from '../core/api.ts';
import { Publisher, State } from '../core/state.ts';
import { handleOpenClawTelegramInbound } from '../telegram/handler.ts';
import {
  OpenClawTelegramBridge,
  type OpenClawBeforeDispatchEvent,
  type OpenClawMessageReceivedContext,
  type OpenClawMessageReceivedEvent,
} from '../telegram/openclaw.ts';
import { telegramIngressTarget } from './telegram-target.ts';
import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';

interface OpenClawPluginApi {
  on(
    name: 'message_received',
    handler: (
      event: OpenClawMessageReceivedEvent,
      context: OpenClawMessageReceivedContext,
    ) => void,
  ): void;
  on(
    name: 'before_dispatch',
    handler: (
      event: OpenClawBeforeDispatchEvent,
    ) => Promise<{ handled: true; text: string } | undefined>,
  ): void;
}

/**
 * Explicit Website target for the existing OpenClaw Telegram ingress.
 * It declares no channel, bot token, webhook or polling ownership: OpenClaw
 * remains the sole receiver and delivers the returned text on its own route.
 */
export default definePluginEntry({
  id: 'waagd-telegram-ingress',
  name: 'WAAGD Telegram ingress',
  description:
    'Owner URL submission through the existing OpenClaw Telegram route.',
  register(api: OpenClawPluginApi) {
    const config = configuration();
    telegramIngressTarget(config.apiOrigin, config.telegramIngressEnvironment);
    if (config.allowedIds.size === 0)
      throw new Error(
        'WAAGD_TELEGRAM_ALLOWED_IDS must contain at least one owner ID.',
      );
    const publisher = new Publisher(
      new Api(config.apiOrigin, config.token, fetch, undefined, config.access),
      new State(config.stateDir),
      { discoveryIngressToken: config.discoveryIngressToken },
    );
    const bridge = new OpenClawTelegramBridge({
      allowedIds: config.allowedIds,
      submit: (event) =>
        handleOpenClawTelegramInbound(event, config.allowedIds, publisher),
    });

    // v2026.10.3 emits this before before_dispatch. The handler is intentionally
    // synchronous so attachment evidence is recorded before the claim hook runs.
    api.on('message_received', (event, context) =>
      bridge.observe(event, context),
    );
    api.on('before_dispatch', async (event) => {
      const reply = await bridge.handle(event);
      return reply ? { handled: true, text: reply.text } : undefined;
    });
  },
});
