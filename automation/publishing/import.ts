/**
 * Fixed, private hand-off from the Discovery editorial store.
 *
 * The host-side bridge is the only writer of this State file. This module never
 * accepts a caller-selected path, API origin, identity, or publication mode.
 */
import { record } from '../core/api.ts';
import type { State } from '../core/state.ts';
import { validateCreatePostInput } from '../../shared/contracts.ts';
import {
  digestPayload,
  PublicationError,
  stableSourceItemId,
} from './publisher.ts';
import type {
  JournalPublisher,
  PublicationIntent,
  PublicationReceipt,
} from './publisher.ts';

export const PUBLICATION_INBOX = 'publication-intents.json';
const PRODUCER = 'waagd-discovery-publication-v1';
const DIGEST = /^[a-f0-9]{64}$/;

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

function string(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value || value.length > max)
    throw new PublicationImportError('invalid_string');
  return value;
}

function identifier(value: unknown): string {
  const result = string(value, 256);
  if (!/^[a-zA-Z0-9:_-]+$/.test(result))
    throw new PublicationImportError('invalid_identity');
  return result;
}

function evidence(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 100 ||
    value.some((id) => typeof id !== 'string' || !DIGEST.test(id)) ||
    new Set(value).size !== value.length
  )
    throw new PublicationImportError('invalid_evidence');
  return value as string[];
}

function intent(value: unknown): PublicationIntent {
  const item = record(value);
  exact(item, [
    'identity',
    'mode',
    'candidate_key',
    'decision_revision',
    'evidence_ids',
    'source_url',
    'content_digest',
    'payload',
  ]);
  const identity = identifier(item.identity);
  const candidateKey = string(item.candidate_key, 256);
  const decisionRevision = item.decision_revision;
  const sourceUrl = item.source_url;
  const contentDigest = item.content_digest;
  const parsed = validateCreatePostInput(item.payload);
  if (
    item.mode !== 'verified_auto' ||
    !DIGEST.test(candidateKey) ||
    typeof decisionRevision !== 'number' ||
    !Number.isSafeInteger(decisionRevision) ||
    decisionRevision < 1 ||
    typeof sourceUrl !== 'string' ||
    typeof contentDigest !== 'string' ||
    !DIGEST.test(contentDigest) ||
    !parsed.valid ||
    identity !== `auto:${candidateKey}:${decisionRevision}` ||
    parsed.value.origin !== 'auto' ||
    parsed.value.url !== sourceUrl ||
    parsed.value.type !== 'article' ||
    parsed.value.source_item_id !== stableSourceItemId(identity) ||
    digestPayload(parsed.value) !== contentDigest
  )
    throw new PublicationImportError('invalid_intent');
  return {
    identity,
    mode: 'verified_auto',
    candidateKey,
    decisionRevision,
    evidenceIds: evidence(item.evidence_ids),
    sourceUrl,
    contentDigest,
    payload: parsed.value,
  };
}

/** Parse Discovery's exact v1 envelope before it reaches the bearer-token client. */
export function parsePublicationBatch(value: unknown): PublicationIntent[] {
  const batch = record(value);
  exact(batch, ['schema_version', 'producer', 'intents']);
  if (
    batch.schema_version !== 1 ||
    batch.producer !== PRODUCER ||
    !Array.isArray(batch.intents) ||
    batch.intents.length > 20
  )
    throw new PublicationImportError('invalid_batch');
  const bytes = Buffer.byteLength(JSON.stringify(batch), 'utf8');
  if (bytes > 256 * 1024) throw new PublicationImportError('batch_too_large');
  const result = batch.intents.map(intent);
  if (new Set(result.map((item) => item.identity)).size !== result.length)
    throw new PublicationImportError('duplicate_identity');
  return result;
}

export type ImportedPublicationResult =
  | { identity: string; status: 'published'; receipt: PublicationReceipt }
  | { identity: string; status: 'held'; error: string };

/**
 * Re-reading the batch after a restart is safe: JournalPublisher's durable
 * identities make already committed entries no-op duplicates instead of posts.
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
