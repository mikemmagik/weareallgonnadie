import { createHash } from 'node:crypto';
import type { CreatePostInput } from '../../shared/contracts.ts';
import { validateCreatePostInput } from '../../shared/contracts.ts';
import { UUID, record } from '../core/api.ts';
import type { State } from '../core/state.ts';

const MAX_SUBMISSION_CHARS = 4000;
const MAX_PREVIEW_CHARS = 1800;
const SUBMISSION_ID = /^[a-f0-9]{24}$/;

export interface TelegramSubmission {
  ownerId: number;
  updateId: number | null;
  messageId: number | null;
  text: string;
  kind: 'url' | 'text';
}

export type EditorialReview =
  | { status: 'ready'; payload: CreatePostInput }
  | { status: 'hold'; reason: string };

/** The reviewer treats owner text and any linked page as data, never as commands. */
export type ReviewSubmission = (
  submission: TelegramSubmission,
) => Promise<EditorialReview>;

/** Must reconcile an uncertain prior POST for the same stable ID before retrying. */
export type PublishSubmission = (
  payload: CreatePostInput,
  stableSubmissionId: string,
) => Promise<{ url: string; postId: string }>;

type SavedSubmission = {
  version: 1;
  id: string;
  ownerId: number;
  text: string;
  kind: 'url' | 'text';
  status: 'reviewing' | 'ready' | 'hold' | 'publishing' | 'published';
  createdAt: string;
  payload?: CreatePostInput;
  reason?: string;
  receipt?: { url: string; postId: string };
};

export class TelegramWorkflowError extends Error {}

function bounded(value: string, limit: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, limit);
}

function submissionId(input: TelegramSubmission): string {
  const event =
    input.updateId !== null &&
    Number.isSafeInteger(input.updateId) &&
    input.updateId >= 0
      ? `update:${input.updateId}`
      : input.messageId !== null &&
          Number.isSafeInteger(input.messageId) &&
          input.messageId >= 0
        ? `message:${input.messageId}`
        : null;
  if (!event) throw new TelegramWorkflowError('Telegram event ID is required.');
  return createHash('sha256')
    .update(`${input.ownerId}:${event}`)
    .digest('hex')
    .slice(0, 24);
}

function filename(id: string): string {
  if (!SUBMISSION_ID.test(id))
    throw new TelegramWorkflowError('Invalid submission ID.');
  return `telegram-submission-${id}.json`;
}

function parseSaved(value: unknown, id: string): SavedSubmission {
  const row = record(value);
  if (
    row.version !== 1 ||
    row.id !== id ||
    !Number.isSafeInteger(row.ownerId) ||
    typeof row.text !== 'string' ||
    row.text.length > MAX_SUBMISSION_CHARS ||
    !['url', 'text'].includes(String(row.kind)) ||
    !['reviewing', 'ready', 'hold', 'publishing', 'published'].includes(
      String(row.status),
    ) ||
    typeof row.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(row.createdAt))
  )
    throw new TelegramWorkflowError('Saved submission is invalid.');
  if (
    row.status === 'ready' ||
    row.status === 'publishing' ||
    row.status === 'published'
  ) {
    const result = validateCreatePostInput(row.payload);
    if (!result.valid || result.value.origin !== 'telegram')
      throw new TelegramWorkflowError('Saved publication payload is invalid.');
  }
  if (row.status === 'published') {
    const receipt = record(row.receipt);
    if (
      typeof receipt.url !== 'string' ||
      !/^https?:$/.test(new URL(receipt.url).protocol) ||
      typeof receipt.postId !== 'string' ||
      !UUID.test(receipt.postId)
    )
      throw new TelegramWorkflowError('Saved publication receipt is invalid.');
  }
  return row as SavedSubmission;
}

export class TelegramSubmissionWorkflow {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly state: State;
  private readonly review: ReviewSubmission;
  private readonly publishApproved: PublishSubmission;

  constructor(
    state: State,
    review: ReviewSubmission,
    publishApproved: PublishSubmission,
  ) {
    this.state = state;
    this.review = review;
    this.publishApproved = publishApproved;
  }

  private async once<T>(id: string, action: () => Promise<T>): Promise<T> {
    const running = this.inFlight.get(id);
    if (running) return running as Promise<T>;
    const task = action();
    this.inFlight.set(id, task);
    try {
      return await task;
    } finally {
      this.inFlight.delete(id);
    }
  }

  private async load(id: string, ownerId: number): Promise<SavedSubmission> {
    const saved = await this.state.read(filename(id));
    if (saved === null)
      throw new TelegramWorkflowError('Submission was not found.');
    const parsed = parseSaved(saved, id);
    if (parsed.ownerId !== ownerId)
      throw new TelegramWorkflowError('Submission was not found.');
    return parsed;
  }

  async stage(input: TelegramSubmission): Promise<string> {
    if (!Number.isSafeInteger(input.ownerId) || input.ownerId < 1)
      throw new TelegramWorkflowError('Invalid Telegram owner ID.');
    const text = input.text.trim();
    if (!text || text.length > MAX_SUBMISSION_CHARS)
      throw new TelegramWorkflowError(
        'Submission must contain 1–4000 characters.',
      );
    const id = submissionId(input);
    return this.once(`stage-${id}`, async () => {
      const existing = await this.state.read(filename(id));
      if (existing !== null) {
        const saved = parseSaved(existing, id);
        if (saved.ownerId !== input.ownerId || saved.text !== text)
          throw new TelegramWorkflowError('Telegram event ID was reused.');
        return id;
      }
      const saved: SavedSubmission = {
        version: 1,
        id,
        ownerId: input.ownerId,
        text,
        kind: input.kind,
        status: 'reviewing',
        createdAt: new Date().toISOString(),
      };
      await this.state.write(filename(id), saved);
      try {
        const decision = await this.review({ ...input, text });
        if (decision.status === 'ready') {
          const result = validateCreatePostInput(decision.payload);
          if (!result.valid || result.value.origin !== 'telegram')
            throw new TelegramWorkflowError('Editorial payload is invalid.');
          saved.status = 'ready';
          saved.payload = result.value;
        } else if (decision.status === 'hold') {
          saved.status = 'hold';
          saved.reason = bounded(decision.reason, 300) || 'Editorial hold.';
        } else {
          throw new TelegramWorkflowError('Editorial decision is invalid.');
        }
      } catch {
        saved.status = 'hold';
        saved.reason = 'Editorial review failed; resubmit for a new review.';
      }
      await this.state.write(filename(id), saved);
      return id;
    });
  }

  async preview(id: string, ownerId: number): Promise<string> {
    const saved = await this.load(id, ownerId);
    const detail =
      saved.status === 'hold'
        ? `HOLD: ${saved.reason ?? 'Editorial review required.'}`
        : saved.payload
          ? `${bounded(saved.payload.title, 300)}\n${bounded(saved.payload.body ?? saved.text, MAX_PREVIEW_CHARS)}`
          : 'Editorial review pending.';
    return `PREVIEW ${id}\nStatus: ${saved.status.toUpperCase()}\n${detail}`;
  }

  async publish(id: string, ownerId: number): Promise<string> {
    return this.once(`publish-${id}`, async () => {
      const saved = await this.load(id, ownerId);
      if (saved.status === 'published')
        return `ALREADY PUBLISHED\n${saved.receipt!.url}\nPublication ID: ${saved.receipt!.postId}`;
      if (
        (saved.status !== 'ready' && saved.status !== 'publishing') ||
        !saved.payload
      )
        throw new TelegramWorkflowError(
          'Submission is not approved for publication.',
        );
      saved.status = 'publishing';
      await this.state.write(filename(id), saved);
      const receipt = await this.publishApproved(
        saved.payload,
        `telegram-${id}`,
      );
      if (
        typeof receipt.url !== 'string' ||
        !/^https?:$/.test(new URL(receipt.url).protocol) ||
        typeof receipt.postId !== 'string' ||
        !UUID.test(receipt.postId)
      )
        throw new TelegramWorkflowError('Publication receipt is invalid.');
      saved.status = 'published';
      saved.receipt = receipt;
      await this.state.write(filename(id), saved);
      return `PUBLISHED\n${receipt.url}\nPublication ID: ${receipt.postId}`;
    });
  }
}
