/**
 * PublicationIntent v1 is the data-only boundary from WAAGD Discovery to this
 * site's trusted publisher.  `authorization` is provenance for audit only;
 * JournalPublisher still requires its separately injected trusted authorizer.
 */
import { validateCreatePostInput } from '../../shared/contracts.ts';
import { UUID, record } from '../core/api.ts';
import {
  digestPayload,
  PublicationError,
  stableSourceItemId,
} from './publisher.ts';
import type { PublicationIntent, PublicationProvenance } from './publisher.ts';

export const PUBLICATION_INTENT_VERSION = 1 as const;
export const PUBLICATION_BATCH_PRODUCER = 'waagd-discovery';
const DIGEST = /^[a-f0-9]{64}$/;
const INTENT_ID = /^auto:([a-f0-9]{64}):([1-9][0-9]*)$/;
const POLICY_VERSION = /^[A-Za-z0-9._:-]{1,128}$/;
const UTC_MILLIS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface PublicationIntentV1 {
  version: 1;
  intent_id: string;
  origin: 'waagd-discovery';
  authorization: { kind: 'trusted_publication_policy'; automatic: true };
  post: unknown;
  candidate_key: string;
  delivery_id: string;
  decision_revision: number;
  verification_status: 'VERIFIED';
  editorial_status: 'READY_FOR_REVIEW';
  publisher: string;
  published_at_source: string;
  risks: Array<{ code: string; severity: RiskSeverity }>;
  evidence_ids: string[];
  content_hash: string;
  publication_policy_version: string;
}

export class PublicationIntentError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`Publication intent rejected: ${code}.`);
    this.code = code;
  }
}

function exact(value: Record<string, unknown>, keys: string[]): void {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new PublicationIntentError('unknown_field');
}

function text(
  value: unknown,
  maximum: number,
  code = 'invalid_string',
): string {
  if (typeof value !== 'string' || !value || value.length > maximum)
    throw new PublicationIntentError(code);
  return value;
}

function risks(value: unknown): void {
  if (!Array.isArray(value) || value.length > 32)
    throw new PublicationIntentError('invalid_risks');
  const seen = new Set<string>();
  for (const item of value) {
    const risk = record(item);
    exact(risk, ['code', 'severity']);
    const code = text(risk.code, 128, 'invalid_risks');
    if (
      seen.has(code) ||
      !['low', 'medium', 'high', 'critical'].includes(String(risk.severity))
    )
      throw new PublicationIntentError('invalid_risks');
    if (risk.severity === 'high' || risk.severity === 'critical')
      throw new PublicationIntentError('publication_risk');
    seen.add(code);
  }
}

function evidence(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 100 ||
    value.some((item) => typeof item !== 'string' || !DIGEST.test(item)) ||
    new Set(value).size !== value.length
  )
    throw new PublicationIntentError('invalid_evidence');
  return value as string[];
}

function timestamp(value: unknown): string {
  const result = text(value, 30, 'invalid_source_timestamp');
  if (!UTC_MILLIS.test(result) || new Date(result).toISOString() !== result)
    throw new PublicationIntentError('invalid_source_timestamp');
  return result;
}

/**
 * Parse the only v1 wire intent.  The returned internal type contains no claim
 * of authority: callers must still supply JournalPublisher.authorize.
 */
export function parsePublicationIntentV1(value: unknown): PublicationIntent {
  const intent = record(value);
  exact(intent, [
    'version',
    'intent_id',
    'origin',
    'authorization',
    'post',
    'candidate_key',
    'delivery_id',
    'decision_revision',
    'verification_status',
    'editorial_status',
    'publisher',
    'published_at_source',
    'risks',
    'evidence_ids',
    'content_hash',
    'publication_policy_version',
  ]);
  const candidateKey = text(intent.candidate_key, 64, 'invalid_candidate_key');
  const intentId = text(intent.intent_id, 256, 'invalid_intent_id');
  const revision = intent.decision_revision;
  const identity = INTENT_ID.exec(intentId);
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    throw new PublicationIntentError('invalid_metadata');
  if (
    !DIGEST.test(candidateKey) ||
    identity === null ||
    identity[1] !== candidateKey ||
    Number(identity[2]) !== revision ||
    intent.origin !== 'waagd-discovery' ||
    intent.verification_status !== 'VERIFIED' ||
    intent.editorial_status !== 'READY_FOR_REVIEW' ||
    !UUID.test(String(intent.delivery_id)) ||
    !POLICY_VERSION.test(String(intent.publication_policy_version))
  )
    throw new PublicationIntentError('invalid_metadata');
  const authorization = record(intent.authorization);
  exact(authorization, ['kind', 'automatic']);
  if (
    authorization.kind !== 'trusted_publication_policy' ||
    authorization.automatic !== true
  )
    throw new PublicationIntentError('invalid_authorization');
  text(intent.publisher, 100, 'invalid_publisher');
  timestamp(intent.published_at_source);
  risks(intent.risks);
  const evidenceIds = evidence(intent.evidence_ids);
  const parsed = validateCreatePostInput(intent.post);
  if (
    !parsed.valid ||
    parsed.value.type !== 'news' ||
    parsed.value.origin !== 'auto' ||
    parsed.value.url === null ||
    typeof parsed.value.body !== 'string' ||
    parsed.value.references.length < 1 ||
    parsed.value.source_item_id !== stableSourceItemId(intentId) ||
    !DIGEST.test(String(intent.content_hash)) ||
    digestPayload(parsed.value) !== intent.content_hash
  )
    throw new PublicationIntentError('invalid_post');
  const provenance: PublicationProvenance = {
    origin: 'waagd-discovery',
    deliveryId: intent.delivery_id as string,
    verificationStatus: 'VERIFIED',
    editorialStatus: 'READY_FOR_REVIEW',
    publisher: intent.publisher as string,
    publishedAtSource: intent.published_at_source as string,
    risks: intent.risks as Array<{ code: string; severity: 'low' | 'medium' }>,
    publicationPolicyVersion: intent.publication_policy_version as string,
  };
  return {
    identity: intentId,
    mode: 'verified_auto',
    candidateKey,
    decisionRevision: revision,
    evidenceIds,
    sourceUrl: parsed.value.url,
    contentDigest: intent.content_hash as string,
    payload: parsed.value,
    provenance,
  };
}

/** Converts a malformed internal publication error to the import boundary type. */
export function isPublicationIntentError(error: unknown): boolean {
  return (
    error instanceof PublicationIntentError || error instanceof PublicationError
  );
}
