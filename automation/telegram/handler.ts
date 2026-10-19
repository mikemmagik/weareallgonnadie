import { createHash } from 'node:crypto';
import { record, UUID } from '../core/api.ts';
import type { Http } from '../core/http.ts';
import { RequestFailure, UnsafeUrlError } from '../core/http.ts';
import { withPublicationIntentContentHash } from '../core/intent.ts';
import type { PublicationIntent } from '../core/intent.ts';
import { prepareUrl } from '../core/metadata.ts';
import type { Publisher } from '../core/state.ts';
import { StateError } from '../core/state.ts';
import type { CreatePostInput } from '../../shared/contracts.ts';

export interface Reply {
  chatId: number;
  text: string;
}

export interface TelegramAdapterOptions {
  allowedIds: ReadonlySet<string>;
  publisher: Publisher;
  http?: Http;
  prepare?: (input: string, http?: Http) => ReturnType<typeof prepareUrl>;
}

/**
 * Minimal projection of OpenClaw's documented `before_dispatch` message facts.
 * The OpenClaw ingress, not this adapter, must set `direct` from its admitted
 * channel context. This stays deliberately separate from raw Bot API updates.
 */
export interface OpenClawTelegramInbound {
  channel: 'telegram';
  direct: boolean;
  senderId: string | number;
  messageId: string | number;
  providerUpdate: string | number;
  content: string;
  media?: readonly unknown[];
}

interface OwnerMessage {
  chatId: number;
  updateId: number;
  messageId: number;
  stableIdentity: boolean;
  ownerKey: string;
  text: string | null;
  hasMedia: boolean;
}

const mediaFields = [
  'photo',
  'video',
  'document',
  'audio',
  'animation',
  'voice',
  'video_note',
  'sticker',
] as const;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function ownerMessage(
  update: unknown,
  allowedIds: ReadonlySet<string>,
): OwnerMessage | null {
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
  const messageId = Number.isSafeInteger(message.message_id)
    ? (message.message_id as number)
    : Number.isSafeInteger(value.update_id)
      ? (value.update_id as number)
      : 0;
  return {
    chatId: chat.id as number,
    // Bot API supplies update_id. The zero fallback keeps an existing callback
    // test harness compatible; production updates still get the stronger pair.
    updateId: Number.isSafeInteger(value.update_id)
      ? (value.update_id as number)
      : messageId,
    messageId,
    stableIdentity:
      Number.isSafeInteger(value.update_id) ||
      Number.isSafeInteger(message.message_id),
    ownerKey: digest(`owner:${sender.id as number}`),
    text: typeof message.text === 'string' ? message.text.trim() : null,
    hasMedia: mediaFields.some((field) => message[field] !== undefined),
  };
}

function intentId(message: OwnerMessage): string {
  return `telegram-${digest(`update:${message.updateId}:message:${message.messageId}`)}`;
}

function splitSubmission(
  text: string,
):
  | { kind: 'url'; url: string; comment: string | null }
  | { kind: 'text'; text: string } {
  const urls = text.match(/https?:\/\/[^\s]+/gi) ?? [];
  if (urls.length === 1) {
    const url = urls[0]!;
    const comment = text.replace(url, '').trim();
    return { kind: 'url', url, comment: comment || null };
  }
  return { kind: 'text', text };
}

function command(text: string): { name: string; argument: string } | null {
  const match = text.match(
    /^\/([a-z]+)(?:@[a-zA-Z0-9_]{1,64})?(?:\s+([\s\S]*))?$/i,
  );
  return match
    ? { name: match[1]!.toLowerCase(), argument: match[2]?.trim() ?? '' }
    : null;
}

function helpText(): string {
  return [
    'Send one public URL to publish it directly.',
    'Add a comment before or after the URL to publish it as the article body.',
    '/preview <URL and optional comment> saves a draft.',
    '/publish publishes the saved draft; /delete <publication_id> removes one.',
    '/status, /pause auto, /resume auto. Uploaded media is not published by this adapter.',
  ].join('\n');
}

function publicationReply(
  publisher: Publisher,
  result: Awaited<ReturnType<Publisher['submitTelegramIntent']>>,
): string {
  return [
    result.outcome === 'created' ? 'PUBLISHED' : 'ALREADY EXISTS',
    `Title: ${result.post.title}`,
    publisher.api.siteUrl(result.post.id),
    `Publication ID: ${result.post.id}`,
    ...(result.post.deleted_at ? ['Previously deleted; remains deleted.'] : []),
  ].join('\n');
}

/**
 * A pure update-to-reply adapter. It does not create a bot, poll Telegram, or
 * make Telegram API calls, so an existing OpenClaw delivery integration can own
 * lifecycle and acknowledgements.
 */
export class TelegramSubmissionAdapter {
  private readonly allowedIds: ReadonlySet<string>;
  private readonly publisher: Publisher;
  private readonly http: Http | undefined;
  private readonly prepare: (
    input: string,
    http?: Http,
  ) => ReturnType<typeof prepareUrl>;

  constructor(options: TelegramAdapterOptions) {
    this.allowedIds = options.allowedIds;
    this.publisher = options.publisher;
    this.http = options.http;
    this.prepare = options.prepare ?? prepareUrl;
  }

  private draftName(message: OwnerMessage): string {
    return `telegram-draft-${message.ownerKey}.json`;
  }

  private statusName(message: OwnerMessage): string {
    return `telegram-status-${message.ownerKey}.json`;
  }

  private async prepareIntent(
    message: OwnerMessage,
    input: string,
  ): Promise<PublicationIntent> {
    const submission = splitSubmission(input);
    const sourceItemId = `telegram-${digest(
      `${message.ownerKey}:${message.updateId}:${message.messageId}`,
    )}`;
    let post: CreatePostInput;
    if (submission.kind === 'text') {
      if (!submission.text) throw new Error('Send text or one public URL.');
      post = {
        type: 'news',
        url: null,
        canonical_url: null,
        source_item_id: sourceItemId,
        title: submission.text.replace(/\s+/g, ' ').slice(0, 300),
        source: 'Telegram',
        origin: 'telegram',
        preview: null,
        embed: null,
        body: submission.text,
        references: [],
      };
    } else {
      post = await this.prepare(submission.url, this.http);
      post.body = submission.comment;
      if (post.source !== 'TikTok') {
        post.source = 'Telegram';
        post.source_item_id = sourceItemId;
      }
    }
    return withPublicationIntentContentHash({
      version: 1,
      intent_id: intentId(message),
      origin: 'telegram',
      authorization: {
        kind: 'telegram-owner',
        approved: true,
        owner_key: message.ownerKey,
      },
      editorial: null,
      post,
    });
  }

  private async saveDraft(
    message: OwnerMessage,
    input: string,
  ): Promise<PublicationIntent> {
    const intent = await this.prepareIntent(message, input);
    await this.publisher.state.write(this.draftName(message), {
      intent,
      saved_at: new Date().toISOString(),
    });
    return intent;
  }

  private async readDraft(message: OwnerMessage): Promise<PublicationIntent> {
    const saved = await this.publisher.state.read(this.draftName(message));
    if (saved === null)
      throw new Error('No draft is saved. Use /preview <URL>.');
    const value = record(saved);
    if (!value.intent || typeof value.saved_at !== 'string')
      throw new StateError('Invalid Telegram draft state.');
    return value.intent as PublicationIntent;
  }

  private preview(intent: PublicationIntent): string {
    return [
      'DRAFT',
      `Title: ${intent.post.title}`,
      `URL: ${intent.post.url ?? 'none'}`,
      `Comment: ${intent.post.body ?? 'none'}`,
      'Use /publish to publish this draft.',
    ].join('\n');
  }

  private async publish(
    message: OwnerMessage,
    intent: PublicationIntent,
  ): Promise<Reply> {
    const result = message.stableIdentity
      ? await this.publisher.submitTelegramIntent(intent)
      : await this.publisher.submit(intent.post);
    await this.publisher.state.remove(this.draftName(message));
    await this.publisher.state.write(this.statusName(message), {
      intent_id: intent.intent_id,
      outcome: result.outcome,
      post_id: result.post.id,
      updated_at: new Date().toISOString(),
    });
    return {
      chatId: message.chatId,
      text: publicationReply(this.publisher, result),
    };
  }

  async handle(update: unknown): Promise<Reply | null> {
    try {
      const message = ownerMessage(update, this.allowedIds);
      if (!message) return null;
      if (message.hasMedia)
        return {
          chatId: message.chatId,
          text: 'UNSUPPORTED MEDIA: uploaded files are not published. Send a public URL instead.',
        };
      if (message.text === null)
        return {
          chatId: message.chatId,
          text: 'FAILED: Send text or one public URL.',
        };
      const parsed = command(message.text);
      if (parsed) {
        if (parsed.name === 'start' || parsed.name === 'help')
          return { chatId: message.chatId, text: helpText() };
        if (parsed.name === 'status') {
          const status = await this.publisher.state.read(
            this.statusName(message),
          );
          const summary = status === null ? null : record(status);
          return {
            chatId: message.chatId,
            text: `STATUS: Telegram is ready. Automatic publication is ${(await this.publisher.isPaused('auto')) ? 'paused' : 'ready'}.${summary && (summary.outcome === 'created' || summary.outcome === 'duplicate') && typeof summary.post_id === 'string' ? ` Last receipt: ${summary.outcome} (${summary.post_id}).` : ''}`,
          };
        }
        if (parsed.name === 'pause') {
          if (parsed.argument && parsed.argument !== 'auto')
            throw new Error('Usage: /pause auto');
          await this.publisher.setPaused('auto', true);
          return {
            chatId: message.chatId,
            text: 'PAUSED: Automatic publication is paused. Telegram owner submissions remain available.',
          };
        }
        if (parsed.name === 'resume') {
          if (parsed.argument && parsed.argument !== 'auto')
            throw new Error('Usage: /resume auto');
          await this.publisher.setPaused('auto', false);
          return {
            chatId: message.chatId,
            text: 'RESUMED: Automatic publication is ready. Telegram owner submissions remain available.',
          };
        }
        if (parsed.name === 'delete') {
          if (!UUID.test(parsed.argument))
            throw new Error('Invalid deletion command.');
          const result = await this.publisher.api.delete(parsed.argument);
          return {
            chatId: message.chatId,
            text: `DELETED\nPublication ID: ${result.id}`,
          };
        }
        if (parsed.name === 'preview') {
          const intent = parsed.argument
            ? await this.saveDraft(message, parsed.argument)
            : await this.readDraft(message);
          return { chatId: message.chatId, text: this.preview(intent) };
        }
        if (parsed.name === 'publish') {
          const intent = parsed.argument
            ? await this.saveDraft(message, parsed.argument)
            : await this.readDraft(message);
          return await this.publish(message, intent);
        }
        return {
          chatId: message.chatId,
          text: `FAILED: Unknown command.\n${helpText()}`,
        };
      }
      return await this.publish(
        message,
        await this.prepareIntent(message, message.text),
      );
    } catch (error) {
      let safe: OwnerMessage | null;
      try {
        safe = ownerMessage(update, this.allowedIds);
      } catch {
        return null;
      }
      if (!safe) return null;
      const reason =
        error instanceof StateError
          ? error.message
          : error instanceof UnsafeUrlError
            ? 'URL must target a safe public publication.'
            : error instanceof RequestFailure &&
                [404, 410].includes(error.status)
              ? `Original publication is missing (HTTP ${error.status}); nothing was published.`
              : error instanceof Error
                ? error.message
                : 'Publication could not be completed.';
      const saved =
        error instanceof RequestFailure &&
        error.retryable &&
        ![404, 410].includes(error.status);
      return {
        chatId: safe.chatId,
        text: `FAILED: ${reason}${saved ? ' Publication payload is saved locally for retry; exhausted retries require manual review.' : error instanceof RequestFailure ? ' No publication payload was saved for retry.' : ''}`,
      };
    }
  }
}

/** Compatibility function for an existing callback/poller owner. */
export async function handleUpdate(
  update: unknown,
  allowedIds: ReadonlySet<string>,
  publisher: Publisher,
  http?: Http,
): Promise<Reply | null> {
  return new TelegramSubmissionAdapter({
    allowedIds,
    publisher,
    ...(http ? { http } : {}),
  }).handle(update);
}

/**
 * Bridge the existing OpenClaw Telegram channel into the same deterministic
 * adapter. Call this from an operator-reviewed `before_dispatch` hook only;
 * it never polls Telegram and never receives a bot token or file URL.
 */
export async function handleOpenClawTelegramInbound(
  event: OpenClawTelegramInbound,
  allowedIds: ReadonlySet<string>,
  publisher: Publisher,
  http?: Http,
): Promise<Reply | null> {
  const numeric = (value: string | number): number | null => {
    const parsed =
      typeof value === 'number'
        ? value
        : /^\d+$/.test(value)
          ? Number(value)
          : Number.NaN;
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  };
  const sender = numeric(event.senderId);
  const messageId = numeric(event.messageId);
  const updateId = numeric(event.providerUpdate);
  if (
    event.channel !== 'telegram' ||
    !event.direct ||
    sender === null ||
    messageId === null ||
    updateId === null
  )
    return null;
  return handleUpdate(
    {
      update_id: updateId,
      message: {
        message_id: messageId,
        from: { id: sender, is_bot: false },
        chat: { id: sender, type: 'private' },
        text: event.content,
        ...(event.media?.length ? { document: { attached: true } } : {}),
      },
    },
    allowedIds,
    publisher,
    http,
  );
}
