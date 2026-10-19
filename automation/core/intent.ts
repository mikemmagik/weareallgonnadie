import { createHash } from 'node:crypto';
import {
  normalizePublicationUrl,
  validateCreatePostInput,
} from '../../shared/contracts.ts';
import type {
  CreatePostInput,
  ValidationIssue,
  ValidationResult,
} from '../../shared/contracts.ts';

export const PUBLICATION_INTENT_VERSION = 1 as const;
export const PUBLICATION_INTENT_ORIGINS = ['auto', 'telegram'] as const;
export type PublicationIntentOrigin =
  (typeof PUBLICATION_INTENT_ORIGINS)[number];

export interface PublicationIntent {
  version: typeof PUBLICATION_INTENT_VERSION;
  /** Stable, non-secret producer identity. Replays must reuse this value. */
  intent_id: string;
  /** SHA-256 of the canonical intent document below; never a secret. */
  content_hash: string;
  origin: PublicationIntentOrigin;
  authorization:
    | { kind: 'discovery'; approved: true }
    | { kind: 'telegram-owner'; approved: true; owner_key: string };
  /** Required for Discovery; records the approval without turning it into a quote. */
  editorial: EditorialMetadata | null;
  post: CreatePostInput;
}

export interface EditorialMetadata {
  decision_id: string;
  source_event_id: string;
  source_attribution: string;
  approved_at: string;
  publication_policy: { version: string; outcome: 'approved' };
}

export class PublicationIntentError extends Error {}

const INTENT_ID = /^[a-z][a-z0-9-]{7,127}$/;
const OWNER_KEY = /^[a-f0-9]{32,128}$/;
const CONTENT_HASH = /^[a-f0-9]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function text(
  value: unknown,
  path: string,
  max: number,
  issues: ValidationIssue[],
): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    issue(issues, path, `Expected non-empty text up to ${max} characters.`);
    return false;
  }
  return true;
}

function timestamp(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    issue(issues, path, 'Expected a normalized UTC timestamp.');
    return false;
  }
  return true;
}

/** Canonical, content-addressed document. Do not hash caller key order. */
function hashDocument(intent: Omit<PublicationIntent, 'content_hash'>): string {
  const post = intent.post;
  return JSON.stringify({
    version: intent.version,
    intent_id: intent.intent_id,
    origin: intent.origin,
    authorization: intent.authorization,
    editorial: intent.editorial,
    post: {
      type: post.type,
      url: post.url,
      canonical_url: post.canonical_url,
      source_item_id: post.source_item_id,
      title: post.title,
      source: post.source,
      origin: post.origin,
      preview: post.preview,
      embed: post.embed,
      body: post.body,
      references: post.references,
    },
  });
}

export function contentHashForPublicationIntent(
  intent: Omit<PublicationIntent, 'content_hash'>,
): string {
  return createHash('sha256').update(hashDocument(intent)).digest('hex');
}

export function withPublicationIntentContentHash(
  intent: Omit<PublicationIntent, 'content_hash'>,
): PublicationIntent {
  return { ...intent, content_hash: contentHashForPublicationIntent(intent) };
}

/** Stable duplicate identity kept alongside a receipt to detect semantic drift. */
export function publicationSemanticIdentity(intent: PublicationIntent): string {
  const post = intent.post;
  const canonical = post.canonical_url ?? post.url;
  return canonical
    ? `url:${normalizePublicationUrl(canonical)}|source:${post.source}\u0000${post.source_item_id ?? ''}`
    : `source:${post.source}\u0000${post.source_item_id ?? ''}`;
}

/**
 * Local, producer-to-publisher envelope. It deliberately is not a website API
 * contract: only Publisher holds the website write credential.
 */
export function validatePublicationIntent(
  input: unknown,
): ValidationResult<PublicationIntent> {
  if (!isRecord(input))
    return {
      valid: false,
      issues: [{ path: '$', message: 'Expected a publication intent object.' }],
    };
  const issues: ValidationIssue[] = [];
  for (const key of Object.keys(input))
    if (
      ![
        'version',
        'intent_id',
        'content_hash',
        'origin',
        'authorization',
        'editorial',
        'post',
      ].includes(key)
    )
      issue(issues, key, 'Unknown field.');
  if (input.version !== PUBLICATION_INTENT_VERSION)
    issue(issues, 'version', 'Expected PublicationIntent version 1.');
  if (typeof input.intent_id !== 'string' || !INTENT_ID.test(input.intent_id))
    issue(
      issues,
      'intent_id',
      'Expected a stable lowercase non-secret identifier.',
    );
  if (
    typeof input.content_hash !== 'string' ||
    !CONTENT_HASH.test(input.content_hash)
  )
    issue(issues, 'content_hash', 'Expected a lowercase SHA-256 content hash.');
  if (
    !PUBLICATION_INTENT_ORIGINS.includes(
      input.origin as PublicationIntentOrigin,
    )
  )
    issue(issues, 'origin', 'Expected auto or telegram origin.');

  const authorization = input.authorization;
  if (!isRecord(authorization))
    issue(issues, 'authorization', 'Expected publication authorization.');
  else if (input.origin === 'auto') {
    for (const key of Object.keys(authorization))
      if (!['kind', 'approved'].includes(key))
        issue(issues, `authorization.${key}`, 'Unknown field.');
    if (authorization.kind !== 'discovery' || authorization.approved !== true)
      issue(
        issues,
        'authorization',
        'Automatic publication requires a discovery approval.',
      );
  } else if (input.origin === 'telegram') {
    for (const key of Object.keys(authorization))
      if (!['kind', 'approved', 'owner_key'].includes(key))
        issue(issues, `authorization.${key}`, 'Unknown field.');
    if (
      authorization.kind !== 'telegram-owner' ||
      authorization.approved !== true ||
      typeof authorization.owner_key !== 'string' ||
      !OWNER_KEY.test(authorization.owner_key)
    )
      issue(
        issues,
        'authorization',
        'Telegram publication requires an approved opaque owner identity.',
      );
  }

  const editorial = input.editorial;
  if (input.origin === 'auto') {
    if (!isRecord(editorial))
      issue(
        issues,
        'editorial',
        'Automatic publication requires editorial metadata.',
      );
    else {
      for (const key of Object.keys(editorial))
        if (
          ![
            'decision_id',
            'source_event_id',
            'source_attribution',
            'approved_at',
            'publication_policy',
          ].includes(key)
        )
          issue(issues, `editorial.${key}`, 'Unknown field.');
      text(editorial.decision_id, 'editorial.decision_id', 128, issues);
      text(editorial.source_event_id, 'editorial.source_event_id', 256, issues);
      text(
        editorial.source_attribution,
        'editorial.source_attribution',
        300,
        issues,
      );
      timestamp(editorial.approved_at, 'editorial.approved_at', issues);
      if (!isRecord(editorial.publication_policy))
        issue(
          issues,
          'editorial.publication_policy',
          'Expected an editorial publication policy.',
        );
      else {
        const policy = editorial.publication_policy;
        for (const key of Object.keys(policy))
          if (!['version', 'outcome'].includes(key))
            issue(
              issues,
              `editorial.publication_policy.${key}`,
              'Unknown field.',
            );
        text(
          policy.version,
          'editorial.publication_policy.version',
          64,
          issues,
        );
        if (policy.outcome !== 'approved')
          issue(
            issues,
            'editorial.publication_policy.outcome',
            'Automatic publication policy must be approved.',
          );
      }
    }
  } else if (editorial !== null)
    issue(
      issues,
      'editorial',
      'Telegram owner submissions cannot claim Discovery editorial metadata.',
    );

  const post = validateCreatePostInput(input.post);
  if (!post.valid)
    issues.push(
      ...post.issues.map((entry) => ({ ...entry, path: `post.${entry.path}` })),
    );
  else {
    if (post.value.origin !== input.origin)
      issue(issues, 'post.origin', 'Post origin must match the intent origin.');
    if (
      input.origin === 'auto' &&
      (post.value.type !== 'news' ||
        post.value.url === null ||
        post.value.body === null ||
        post.value.references.length === 0)
    )
      issue(
        issues,
        'post',
        'Automatic intents require a news article body and verified references.',
      );
  }
  if (
    !issues.length &&
    input.content_hash !==
      contentHashForPublicationIntent(
        input as unknown as Omit<PublicationIntent, 'content_hash'>,
      )
  )
    issue(
      issues,
      'content_hash',
      'Does not match the canonical intent contents.',
    );
  return issues.length
    ? { valid: false, issues }
    : { valid: true, value: input as unknown as PublicationIntent };
}

export function mapPublicationIntent(
  intent: PublicationIntent,
): CreatePostInput {
  const result = validatePublicationIntent(intent);
  if (!result.valid)
    throw new PublicationIntentError('Invalid publication intent.');
  return result.value.post;
}
