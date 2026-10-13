import type { Publisher } from '../core/state.ts';
import { record } from '../core/api.ts';
import { handleUpdate } from './handler.ts';
import { pause, retryRequest } from '../core/http.ts';
import type { Http } from '../core/http.ts';

export async function telegramCall(
  http: Http,
  token: string,
  method: string,
  data: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await retryRequest(
    http,
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      ...(signal ? { signal } : {}),
    },
  );
  const result = record(await response.json());
  if (result.ok !== true) throw new Error('Telegram operation failed.');
  return result.result;
}
export async function pollTelegram(
  publisher: Publisher,
  allowedIds: ReadonlySet<string>,
  token: string,
  signal: AbortSignal,
  http: Http = fetch,
) {
  if (!token || !allowedIds.size)
    throw new Error('Telegram credentials and IDs are required.');
  return publisher.state.locked('telegram', async () => {
    const saved = await publisher.state.read('telegram-offset.json');
    let offset = saved === null ? 0 : Number(record(saved).offset);
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new Error('Invalid Telegram offset.');
    let failures = 0;
    while (!signal.aborted) {
      try {
        const updates = await telegramCall(
          http,
          token,
          'getUpdates',
          { offset, timeout: 20, allowed_updates: ['message'] },
          signal,
        );
        if (!Array.isArray(updates))
          throw new Error('Invalid Telegram update list.');
        for (const raw of updates) {
          if (signal.aborted) break;
          const update = record(raw);
          if (
            !Number.isSafeInteger(update.update_id) ||
            Number(update.update_id) < offset
          )
            continue;
          const reply = await handleUpdate(update, allowedIds, publisher);
          if (reply)
            await telegramCall(
              http,
              token,
              'sendMessage',
              {
                chat_id: reply.chatId,
                text: reply.text,
                link_preview_options: { is_disabled: true },
              },
              signal,
            );
          offset = Number(update.update_id) + 1;
          await publisher.state.write('telegram-offset.json', { offset });
        }
        failures = 0;
      } catch {
        if (signal.aborted) break;
        failures++;
        // A daemon may poll indefinitely; consecutive failed requests are bounded.
        if (failures >= 5)
          throw new Error(
            'Telegram polling stopped after repeated failures. Check configuration and restart.',
          );
        await pause(Math.min(30_000, 1000 * 2 ** failures));
      }
    }
  });
}
