import { createHash } from 'node:crypto';
import { validateCreatePostInput } from '../../shared/contracts.ts';
import {
  contentHashForPost,
  validatePublicationIntent,
  withPublicationIntentContentHash,
} from '../core/intent.ts';
import type { PublicationIntent } from '../core/intent.ts';
import type { Publisher } from '../core/state.ts';
import type { CreatePostResult } from '../../shared/contracts.ts';

/**
 * @deprecated Strict compatibility reader for the retired Discovery 7ac6bcb
 * batch export. New Sprint 6 traffic must use ingress.ts and submit the core
 * PublicationIntent v1 directly. This module is retained only to read a
 * bounded historical export; it is not imported by the active pipeline.
 */
const PRODUCER = 'waagd-discovery';
const SHA256 = /^[a-f0-9]{64}$/;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INTENT_ID = /^auto:([a-f0-9]{64}):([1-9][0-9]*)$/;
const POLICY_VERSION = /^[A-Za-z0-9._:-]{1,128}$/;

export class DiscoveryImportError extends Error {}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new DiscoveryImportError(`Invalid ${label}.`);
  return value as Record<string, unknown>;
}

function exact(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  if (
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new DiscoveryImportError(`Unexpected ${label} fields.`);
}

function text(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw new DiscoveryImportError(`Invalid ${label}.`);
  return value;
}

function utcMillis(value: unknown, label: string): string {
  const result = text(value, 30, label);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString() !== result
  )
    throw new DiscoveryImportError(`Invalid ${label}.`);
  return result;
}

function stableSourceItemId(intentId: string): string {
  return `waagd:${createHash('sha256').update(intentId).digest('hex')}`;
}

function importedIntent(raw: unknown): PublicationIntent {
  const value = object(raw, 'Discovery export');
  exact(
    value,
    [
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
      'content_hash',
      'publication_policy_version',
      'evidence_ids',
    ],
    'Discovery export',
  );
  const intentId = text(value.intent_id, 256, 'intent_id');
  const match = INTENT_ID.exec(intentId);
  if (
    value.version !== 1 ||
    value.origin !== PRODUCER ||
    match === null ||
    value.candidate_key !== match[1] ||
    value.decision_revision !== Number(match[2]) ||
    !UUID_V4.test(String(value.delivery_id)) ||
    value.verification_status !== 'VERIFIED' ||
    value.editorial_status !== 'READY_FOR_REVIEW' ||
    !POLICY_VERSION.test(String(value.publication_policy_version))
  )
    throw new DiscoveryImportError('Invalid Discovery publication metadata.');
  const authorization = object(value.authorization, 'authorization');
  exact(authorization, ['kind', 'automatic'], 'authorization');
  if (
    authorization.kind !== 'trusted_publication_policy' ||
    authorization.automatic !== true
  )
    throw new DiscoveryImportError('Discovery authorization is not approved.');
  const publisher = text(value.publisher, 100, 'publisher');
  const approvedAt = utcMillis(
    value.published_at_source,
    'published_at_source',
  );
  if (
    !Array.isArray(value.evidence_ids) ||
    value.evidence_ids.length < 1 ||
    value.evidence_ids.length > 100 ||
    value.evidence_ids.some(
      (item) => typeof item !== 'string' || !SHA256.test(item),
    ) ||
    new Set(value.evidence_ids).size !== value.evidence_ids.length ||
    !Array.isArray(value.risks) ||
    value.risks.length > 32
  )
    throw new DiscoveryImportError('Invalid Discovery evidence or risks.');
  for (const rawRisk of value.risks) {
    const risk = object(rawRisk, 'risk');
    exact(risk, ['code', 'severity'], 'risk');
    text(risk.code, 128, 'risk code');
    if (!['low', 'medium'].includes(String(risk.severity)))
      throw new DiscoveryImportError('Discovery intent has a blocking risk.');
  }
  const post = validateCreatePostInput(value.post);
  if (
    !post.valid ||
    post.value.type !== 'news' ||
    post.value.origin !== 'auto' ||
    post.value.url === null ||
    post.value.body === null ||
    post.value.references.length === 0 ||
    post.value.source_item_id !== stableSourceItemId(intentId) ||
    value.content_hash !== contentHashForPost(post.value)
  )
    throw new DiscoveryImportError('Invalid Discovery publication content.');
  const normalized = withPublicationIntentContentHash({
    version: 1,
    intent_id: intentId,
    origin: 'auto',
    authorization: { kind: 'discovery', approved: true },
    editorial: {
      // Candidate/revision is durable identity; delivery_id is intentionally a
      // transport redelivery token and must not make a second publication.
      decision_id: intentId,
      source_event_id: intentId,
      source_attribution: publisher,
      approved_at: approvedAt,
      publication_policy: {
        version: value.publication_policy_version as string,
        outcome: 'approved',
      },
    },
    post: post.value,
  });
  if (!validatePublicationIntent(normalized).valid)
    throw new DiscoveryImportError('Normalized PublicationIntent is invalid.');
  return normalized;
}

/** Convert the Python producer's batch to the single canonical site intent type. */
export function importDiscoveryPublicationExportV1(
  input: unknown,
): PublicationIntent[] {
  const batch = object(input, 'Discovery batch');
  exact(batch, ['version', 'producer', 'intents'], 'Discovery batch');
  if (
    batch.version !== 1 ||
    batch.producer !== PRODUCER ||
    !Array.isArray(batch.intents) ||
    batch.intents.length > 100 ||
    Buffer.byteLength(JSON.stringify(batch), 'utf8') > 256 * 1024
  )
    throw new DiscoveryImportError('Invalid Discovery batch.');
  const intents = batch.intents.map(importedIntent);
  if (
    new Set(intents.map((intent) => intent.intent_id)).size !== intents.length
  )
    throw new DiscoveryImportError('Duplicate Discovery intent_id.');
  return intents;
}

/** @deprecated Historical batch entrypoint; use acceptDiscoveryPublicationIntent. */
export async function acceptDiscoveryPublicationExportV1(
  publisher: Publisher,
  input: unknown,
  ingressToken: string,
): Promise<CreatePostResult[]> {
  const intents = importDiscoveryPublicationExportV1(input);
  const results: CreatePostResult[] = [];
  for (const intent of intents)
    results.push(await publisher.submitDiscoveryIntent(intent, ingressToken));
  return results;
}
