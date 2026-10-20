import type { Reply, OpenClawTelegramInbound } from './handler.ts';

/** Exact field subset exposed by OpenClaw v2026.10.3 `before_dispatch`. */
export interface OpenClawBeforeDispatchEvent {
  channel?: string;
  content: string;
  messageId?: string;
  senderId?: string;
  isGroup?: boolean;
}

/** Exact inbound media facts exposed by OpenClaw v2026.10.3 `message_received`. */
export interface OpenClawMessageReceivedEvent {
  messageId?: string;
  senderId?: string;
  media?: readonly unknown[];
  originalMedia?: readonly unknown[];
  mediaStagingPending?: boolean;
}

export interface OpenClawMessageReceivedContext {
  channelId: string;
}

export interface OpenClawTelegramBridgeOptions {
  allowedIds: ReadonlySet<string>;
  submit: (event: OpenClawTelegramInbound) => Promise<Reply | null>;
}

interface ObservedMessage {
  hasMedia: boolean;
  expiresAt: number;
}

function numeric(value: string | undefined): string | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? String(parsed) : null;
}

function key(senderId: string, messageId: string): string {
  return `${senderId}:${messageId}`;
}

/**
 * Joins OpenClaw's two documented hook projections without receiving a Bot API
 * update, token, file URL, webhook or polling loop. `message_received` arrives
 * before `before_dispatch`; its media fact makes attachment refusal fail closed.
 */
export class OpenClawTelegramBridge {
  private readonly allowedIds: ReadonlySet<string>;
  private readonly submit: (
    event: OpenClawTelegramInbound,
  ) => Promise<Reply | null>;
  private readonly observed = new Map<string, ObservedMessage>();

  constructor(options: OpenClawTelegramBridgeOptions) {
    this.allowedIds = options.allowedIds;
    this.submit = options.submit;
  }

  observe(
    event: OpenClawMessageReceivedEvent,
    context: OpenClawMessageReceivedContext,
  ): void {
    if (context.channelId !== 'telegram') return;
    const senderId = numeric(event.senderId);
    const messageId = numeric(event.messageId);
    if (!senderId || !messageId) return;
    const now = Date.now();
    this.prune(now);
    this.observed.set(key(senderId, messageId), {
      hasMedia:
        Boolean(event.media?.length) ||
        Boolean(event.originalMedia?.length) ||
        event.mediaStagingPending === true,
      expiresAt: now + 5 * 60_000,
    });
    if (this.observed.size > 1_024) {
      const oldest = this.observed.keys().next().value;
      if (oldest) this.observed.delete(oldest);
    }
  }

  async handle(event: OpenClawBeforeDispatchEvent): Promise<Reply | null> {
    if (event.channel !== 'telegram' || event.isGroup !== false) return null;
    const senderId = numeric(event.senderId);
    const messageId = numeric(event.messageId);
    if (!senderId || !messageId || !this.allowedIds.has(senderId)) return null;

    const observed = this.observed.get(key(senderId, messageId));
    if (!observed || observed.expiresAt <= Date.now()) {
      this.observed.delete(key(senderId, messageId));
      return {
        chatId: Number(senderId),
        text: 'FAILED: OpenClaw did not provide attachment evidence for this message; nothing was published.',
      };
    }
    this.observed.delete(key(senderId, messageId));
    // Telegram message IDs are unique within this direct chat (whose chat ID is
    // the owner ID). The pair is therefore a stable redelivery identity when
    // v2026.10.3's before_dispatch hook does not expose providerUpdate.
    return this.submit({
      channel: 'telegram',
      direct: true,
      senderId,
      messageId,
      providerUpdate: messageId,
      content: event.content,
      ...(observed.hasMedia ? { media: [{}] } : {}),
    });
  }

  private prune(now: number): void {
    for (const [message, observed] of this.observed)
      if (observed.expiresAt <= now) this.observed.delete(message);
  }
}
