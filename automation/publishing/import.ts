/**
 * Fixed, private hand-off from the Discovery editorial store.
 *
 * The host-side bridge is the only writer of this State file. This module never
 * accepts a caller-selected path, API origin, identity, or publication mode.
 */
import { record } from '../core/api.ts';
import type { State } from '../core/state.ts';
import {
  parsePublicationIntentV1,
  PublicationIntentError,
} from './publication-intent.ts';
import { PublicationError } from './publisher.ts';
import type {
  JournalPublisher,
  PublicationIntent,
  PublicationReceipt,
} from './publisher.ts';

export const PUBLICATION_INBOX = 'publication-intents.json';
export const PUBLICATION_BATCH_PRODUCER = 'waagd-discovery';

export class PublicationImportError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`Publication import rejected: ${code}.`);
    this.code = code;
  }
}

function exact(value: Record<string, unknown>, keys: string[]): void {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new PublicationImportError('unknown_field');
}

/** Parse a bounded list of one, shared PublicationIntent v1 schema. */
export function parsePublicationBatch(value: unknown): PublicationIntent[] {
  const batch = record(value);
  exact(batch, ['version', 'producer', 'intents']);
  if (
    batch.version !== 1 ||
    batch.producer !== PUBLICATION_BATCH_PRODUCER ||
    !Array.isArray(batch.intents) ||
    batch.intents.length > 100
  )
    throw new PublicationImportError('invalid_batch');
  const bytes = Buffer.byteLength(JSON.stringify(batch), 'utf8');
  if (bytes > 256 * 1024) throw new PublicationImportError('batch_too_large');
  try {
    const result = batch.intents.map(parsePublicationIntentV1);
    if (new Set(result.map((item) => item.identity)).size !== result.length)
      throw new PublicationImportError('duplicate_intent_id');
    return result;
  } catch (error) {
    if (error instanceof PublicationImportError) throw error;
    if (error instanceof PublicationIntentError)
      throw new PublicationImportError(error.code);
    throw error;
  }
}

export type ImportedPublicationResult =
  | { identity: string; status: 'published'; receipt: PublicationReceipt }
  | { identity: string; status: 'held'; error: string };

/**
 * Re-reading the batch after a restart is safe: JournalPublisher's durable
 * intent IDs make already committed entries no-op duplicates instead of posts.
 */
export async function publishImported(
  state: State,
  publisher: JournalPublisher,
): Promise<{
  status: 'empty' | 'processed';
  results: ImportedPublicationResult[];
}> {
  const raw = await state.read(PUBLICATION_INBOX);
  if (raw === null) return { status: 'empty', results: [] };
  const intents = parsePublicationBatch(raw);
  const results: ImportedPublicationResult[] = [];
  for (const item of intents) {
    try {
      results.push({
        identity: item.identity,
        status: 'published',
        receipt: await publisher.publish(item),
      });
    } catch (error) {
      const code =
        error instanceof PublicationError ? error.code : 'publisher_failed';
      results.push({ identity: item.identity, status: 'held', error: code });
    }
  }
  return { status: 'processed', results };
}
