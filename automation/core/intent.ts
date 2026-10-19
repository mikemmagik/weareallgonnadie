import type {
  CreatePostInput,
  ValidationIssue,
  ValidationResult,
} from '../../shared/contracts.ts';
import { validateCreatePostInput } from '../../shared/contracts.ts';

export const PUBLICATION_INTENT_VERSION = 1 as const;
export const PUBLICATION_INTENT_ORIGINS = ['auto', 'telegram'] as const;
export type PublicationIntentOrigin =
  (typeof PUBLICATION_INTENT_ORIGINS)[number];

export interface PublicationIntent {
  version: typeof PUBLICATION_INTENT_VERSION;
  /** Stable, non-secret producer identity. Replays must reuse this value. */
  intent_id: string;
  origin: PublicationIntentOrigin;
  authorization:
    | { kind: 'discovery'; approved: true }
    | { kind: 'telegram-owner'; approved: true; owner_key: string };
  post: CreatePostInput;
}

export class PublicationIntentError extends Error {}

const authorityBrand = Symbol('publication-authority');
/**
 * In-memory capability, intentionally absent from PublicationIntent JSON. A
 * receiving adapter earns one only after it has authenticated its own transport.
 */
export interface PublicationAuthority {
  readonly origin: PublicationIntentOrigin;
  readonly [authorityBrand]: true;
}

export function createPublicationAuthority(
  origin: PublicationIntentOrigin,
): PublicationAuthority {
  return Object.freeze({ origin, [authorityBrand]: true as const });
}

export function hasPublicationAuthority(
  value: unknown,
  origin: PublicationIntentOrigin,
): value is PublicationAuthority {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as PublicationAuthority).origin === origin &&
    (value as PublicationAuthority)[authorityBrand] === true
  );
}

const INTENT_ID = /^[a-z][a-z0-9-]{7,127}$/;
const OWNER_KEY = /^[a-f0-9]{32,128}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(issues: ValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
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
      !['version', 'intent_id', 'origin', 'authorization', 'post'].includes(key)
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
        post.value.body === null ||
        post.value.references.length === 0)
    )
      issue(
        issues,
        'post',
        'Automatic intents require a news article body and verified references.',
      );
  }
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
