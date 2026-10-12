import type { Publisher } from '../core/state.ts';
import { record, UUID } from '../core/api.ts';
import { prepareUrl } from '../core/metadata.ts';
import type { Http } from '../core/http.ts';

export interface Reply {
  chatId: number;
  text: string;
}
export async function handleUpdate(
  update: unknown,
  allowedIds: ReadonlySet<string>,
  publisher: Publisher,
  http?: Http,
): Promise<Reply | null> {
  try {
    const value = record(update);
    if (!value.message) return null;
    const message = record(value.message);
    const sender = record(message.from);
    const chat = record(message.chat);
    if (
      !Number.isSafeInteger(sender.id) ||
      !Number.isSafeInteger(chat.id) ||
      sender.is_bot === true ||
      chat.type !== 'private' ||
      chat.id !== sender.id ||
      !allowedIds.has(String(sender.id))
    )
      return null;
    const chatId = chat.id as number;
    if (typeof message.text !== 'string')
      return {
        chatId,
        text: 'FAILED: Send one public URL or /delete <post_id>.',
      };
    const text = message.text.trim();
    try {
      if (/^\/delete(?:\s|$)/.test(text)) {
        const id = text.split(/\s+/)[1];
        if (!id || !UUID.test(id) || text.split(/\s+/).length !== 2)
          throw new Error('Invalid deletion command.');
        const result = await publisher.api.delete(id);
        return { chatId, text: `DELETED\nPublication ID: ${result.id}` };
      }
      // The human approved the URL. This path never calls the editorial AI.
      const payload = await prepareUrl(text, http);
      const result = await publisher.submit(payload);
      return {
        chatId,
        text: `${result.outcome === 'created' ? 'PUBLISHED' : 'ALREADY EXISTS'}\n${publisher.api.siteUrl(result.post.id)}\nPublication ID: ${result.post.id}${result.post.deleted_at ? '\nPreviously deleted; remains deleted.' : ''}`,
      };
    } catch {
      return {
        chatId,
        text: 'FAILED: Publication or deletion could not be completed. Temporary publication failures are saved locally for retry.',
      };
    }
  } catch {
    return null;
  }
}
