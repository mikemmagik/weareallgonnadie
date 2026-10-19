import type { Publisher } from '../core/state.ts';
import { record, UUID } from '../core/api.ts';
import { prepareUrl } from '../core/metadata.ts';
import type { Http } from '../core/http.ts';
import { RequestFailure, UnsafeUrlError } from '../core/http.ts';
import { StateError, payloadKey } from '../core/state.ts';
import type { CreatePostInput } from '../../shared/contracts.ts';
import {
  TelegramWorkflowError,
  type TelegramSubmissionWorkflow,
} from './workflow.ts';

export interface Reply {
  chatId: number;
  text: string;
}
export async function handleUpdate(
  update: unknown,
  allowedIds: ReadonlySet<string>,
  publisher: Publisher,
  http?: Http,
  workflow?: TelegramSubmissionWorkflow,
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
    if (
      workflow &&
      [
        'photo',
        'video',
        'document',
        'animation',
        'audio',
        'voice',
        'sticker',
        'video_note',
      ].some((field) => field in message)
    )
      return {
        chatId,
        text: 'FAILED: Binary Telegram media is unsupported. Send a public media URL as text.',
      };
    if (typeof message.text !== 'string')
      return {
        chatId,
        text: workflow
          ? 'FAILED: Send a URL or text, /preview <id>, /publish <id>, or /delete <post_id>.'
          : 'FAILED: Send one public URL or /delete <post_id>.',
      };
    const text = message.text.trim();
    let payload: CreatePostInput | undefined;
    try {
      if (/^\/delete(?:\s|$)/.test(text)) {
        const id = text.split(/\s+/)[1];
        if (!id || !UUID.test(id) || text.split(/\s+/).length !== 2)
          throw new Error('Invalid deletion command.');
        const result = await publisher.api.delete(id);
        return { chatId, text: `DELETED\nPublication ID: ${result.id}` };
      }
      if (workflow) {
        const command = text.match(/^\/(preview|publish)(?:\s+(\S+))?$/);
        if (command) {
          const id = command[2];
          if (!id || text.split(/\s+/).length !== 2)
            throw new TelegramWorkflowError(
              'Expected /preview <id> or /publish <id>.',
            );
          return {
            chatId,
            text:
              command[1] === 'preview'
                ? await workflow.preview(id, chatId)
                : await workflow.publish(id, chatId),
          };
        }
        if (text.startsWith('/'))
          throw new TelegramWorkflowError('Unknown Telegram command.');
        const id = await workflow.stage({
          ownerId: chatId,
          updateId: Number.isSafeInteger(value.update_id)
            ? (value.update_id as number)
            : null,
          messageId: Number.isSafeInteger(message.message_id)
            ? (message.message_id as number)
            : null,
          text,
          kind: /^https?:\/\/\S+$/i.test(text) ? 'url' : 'text',
        });
        return {
          chatId,
          text: `STAGED ${id}\n${await workflow.preview(id, chatId)}\nUse /publish ${id} to publish.`,
        };
      }
      // The human approved the URL. This path never calls the editorial AI.
      payload = await prepareUrl(text, http);
      const result = await publisher.submit(payload);
      return {
        chatId,
        text: `${result.outcome === 'created' ? 'PUBLISHED' : 'ALREADY EXISTS'}\n${publisher.api.siteUrl(result.post.id)}\nPublication ID: ${result.post.id}${result.post.deleted_at ? '\nPreviously deleted; remains deleted.' : ''}`,
      };
    } catch (error) {
      if (workflow && !/^\/delete(?:\s|$)/.test(text))
        return {
          chatId,
          text: `FAILED: ${error instanceof TelegramWorkflowError ? error.message : 'Editorial workflow or publication could not be completed.'}`,
        };
      let saved = false;
      if (payload) {
        try {
          saved =
            (await publisher.state.read(
              `outgoing-${payloadKey(payload)}.json`,
            )) !== null;
        } catch {
          /* Never claim persistence when state cannot be verified. */
        }
      }
      const reason =
        error instanceof StateError
          ? error.message
          : error instanceof UnsafeUrlError
            ? 'URL must target a safe public publication.'
            : !payload &&
                error instanceof RequestFailure &&
                [404, 410].includes(error.status)
              ? `Original publication is missing (HTTP ${error.status}); nothing was published.`
              : 'Publication or deletion could not be completed.';
      return {
        chatId,
        text: `FAILED: ${reason}${saved ? ' Publication payload is saved locally for retry; exhausted retries require manual review.' : ' No publication payload was saved for retry.'}`,
      };
    }
  } catch {
    return null;
  }
}
