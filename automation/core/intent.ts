import { createHash } from 'node:crypto';
import {
  isHttpUrl,
  normalizePublicationUrl,
  validateCreatePostInput,
} from '../../shared/contracts.ts';
import type {
  CreatePostInput,
  ValidationIssue,
  ValidationResult,
} from '../../shared/contracts.ts';

/** v1 remains frozen; no v2 field is interpreted under this version. */
export const PUBLICATION_INTENT_VERSION = 1 as const;
export const PUBLICATION_INTENT_V2_VERSION = 2 as const;
export const PUBLICATION_INTENT_ORIGINS = ['auto', 'telegram'] as const;
export type PublicationIntentOrigin =
  (typeof PUBLICATION_INTENT_ORIGINS)[number];

export interface PublicationIntentV1 {
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
  editorial: EditorialMetadataV1 | null;
  post: CreatePostInput;
}

export interface EditorialMetadataV1 {
  decision_id: string;
  source_event_id: string;
  source_attribution: string;
  approved_at: string;
  publication_policy: { version: string; outcome: 'approved' };
}

export const EDITORIAL_REVIEW_ROUTES = [
  'independently_verified',
  'trusted_publisher',
] as const;
export type EditorialReviewRoute = (typeof EDITORIAL_REVIEW_ROUTES)[number];

/** Exact publisher-identity proof, not a claim of independently verified facts. */
export interface TrustedPublisherProvenance {
  publisher_id: string;
  publisher_name: string;
  trusted_rss_url: string;
  article_url: string;
  article_host: string;
  verified_at: string;
  safety_gates: {
    publisher_identity: true;
    safe_retrieval: true;
    sensitive_content: 'clear';
  };
}

export interface EditorialMetadataV2 {
  decision_id: string;
  source_event_id: string;
  source_attribution: string;
  approved_at: string;
  publication_policy: { version: string; outcome: 'approved' };
  review_route: EditorialReviewRoute;
  trusted_publisher: TrustedPublisherProvenance | null;
}

export interface PublicationIntentV2 {
  version: typeof PUBLICATION_INTENT_V2_VERSION;
  intent_id: string;
  content_hash: string;
  origin: PublicationIntentOrigin;
  authorization: { kind: 'discovery'; approved: true };
  editorial: EditorialMetadataV2;
  post: CreatePostInput;
}

export type PublicationIntent = PublicationIntentV1 | PublicationIntentV2;
export type EditorialMetadata = EditorialMetadataV1 | EditorialMetadataV2;

export class PublicationIntentError extends Error {}

/** Supports legacy site IDs and Discovery's stable `auto:<hash>:<revision>`. */
const INTENT_ID = /^[a-z][a-z0-9:_-]{7,255}$/;
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

/**
 * Cross-language canonical JSON for content hashing: sort object keys, preserve
 * array order, use compact UTF-8 JSON, and reject values Python cannot emit with
 * `ensure_ascii=False, allow_nan=False`. Publication content has no numeric
 * fields, so this deliberately avoids a non-portable number serializer.
 */
export function canonicalPublicationJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalPublicationJson(item)).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalPublicationJson(record[key])}`,
      )
      .join(',')}}`;
  }
  if (value === undefined)
    throw new PublicationIntentError('Undefined content.');
  if (
    typeof value === 'string' &&
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(
      value,
    )
  )
    throw new PublicationIntentError('Invalid Unicode content.');
  if (typeof value === 'number' && !Number.isFinite(value))
    throw new PublicationIntentError('Non-finite content.');
  return JSON.stringify(value);
}

/**
 * Exact v1 document used by the Discovery Python producer for `content_hash`.
 *
 * The insertion order is part of the cross-language wire contract: Python uses
 * compact `json.dumps(..., ensure_ascii=False, allow_nan=False)` over this
 * document and TypeScript uses `JSON.stringify` over the same field order.
 * Incoming JSON key order is deliberately irrelevant because we rebuild it.
 */
export type UnsignedPublicationIntent =
  | Omit<PublicationIntentV1, 'content_hash'>
  | Omit<PublicationIntentV2, 'content_hash'>;

function publicationIntentHashDocument(
  intent: UnsignedPublicationIntent,
): Record<string, unknown> {
  const post = intent.post;
  if (intent.version === PUBLICATION_INTENT_V2_VERSION) {
    const editorial = intent.editorial;
    return {
      version: intent.version,
      intent_id: intent.intent_id,
      origin: intent.origin,
      authorization: {
        kind: intent.authorization.kind,
        approved: intent.authorization.approved,
      },
      editorial: {
        decision_id: editorial.decision_id,
        source_event_id: editorial.source_event_id,
        source_attribution: editorial.source_attribution,
        approved_at: editorial.approved_at,
        publication_policy: {
          version: editorial.publication_policy.version,
          outcome: editorial.publication_policy.outcome,
        },
        review_route: editorial.review_route,
        trusted_publisher: editorial.trusted_publisher,
      },
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
    };
  }
  return {
    version: intent.version,
    intent_id: intent.intent_id,
    origin: intent.origin,
    authorization:
      intent.authorization.kind === 'telegram-owner'
        ? {
            kind: intent.authorization.kind,
            approved: intent.authorization.approved,
            owner_key: intent.authorization.owner_key,
          }
        : {
            kind: intent.authorization.kind,
            approved: intent.authorization.approved,
          },
    editorial:
      intent.editorial === null
        ? null
        : {
            decision_id: intent.editorial.decision_id,
            source_event_id: intent.editorial.source_event_id,
            source_attribution: intent.editorial.source_attribution,
            approved_at: intent.editorial.approved_at,
            publication_policy: {
              version: intent.editorial.publication_policy.version,
              outcome: intent.editorial.publication_policy.outcome,
            },
          },
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
  };
}

/** SHA-256 of the canonical PublicationIntent v1 document. */
export function contentHashForPublicationIntent(
  intent: UnsignedPublicationIntent,
): string {
  const document = publicationIntentHashDocument(intent);
  // Validate strings before JSON.stringify so invalid UTF-16 never gains a
  // producer-specific replacement character during serialization.
  canonicalPublicationJson(document);
  return createHash('sha256')
    .update(JSON.stringify(document), 'utf8')
    .digest('hex');
}

export function contentHashForPost(post: CreatePostInput): string {
  return createHash('sha256')
    .update(canonicalPublicationJson(post), 'utf8')
    .digest('hex');
}

export function withPublicationIntentContentHash<
  T extends UnsignedPublicationIntent,
>(intent: T): T & { content_hash: string } {
  return { ...intent, content_hash: contentHashForPublicationIntent(intent) };
}

/** Stable duplicate identity kept alongside a receipt to detect semantic drift. */
export function publicationSemanticIdentity(intent: PublicationIntent): string {
  const post = intent.post;
  const canonical = post.canonical_url ?? post.url;
  return createHash('sha256')
    .update(
      canonicalPublicationJson({
        intent_id: intent.intent_id,
        origin: intent.origin,
        authorization: intent.authorization,
        editorial: intent.editorial,
        content_hash: intent.content_hash,
        canonical_url: canonical ? normalizePublicationUrl(canonical) : null,
        source: post.source,
        source_item_id: post.source_item_id,
      }),
      'utf8',
    )
    .digest('hex');
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
  if (
    input.version !== PUBLICATION_INTENT_VERSION &&
    input.version !== PUBLICATION_INTENT_V2_VERSION
  )
    issue(issues, 'version', 'Expected PublicationIntent version 1 or 2.');
  if (
    input.version === PUBLICATION_INTENT_V2_VERSION &&
    input.origin !== 'auto'
  )
    issue(
      issues,
      'origin',
      'PublicationIntent v2 is limited to Discovery auto ingress.',
    );
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
            ...(input.version === PUBLICATION_INTENT_V2_VERSION
              ? ['review_route', 'trusted_publisher']
              : []),
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
      if (input.version === PUBLICATION_INTENT_V2_VERSION) {
        const route = editorial.review_route;
        if (!EDITORIAL_REVIEW_ROUTES.includes(route as EditorialReviewRoute))
          issue(
            issues,
            'editorial.review_route',
            'Expected independently_verified or trusted_publisher.',
          );
        const provenance = editorial.trusted_publisher;
        if (route === 'independently_verified') {
          if (provenance !== null)
            issue(
              issues,
              'editorial.trusted_publisher',
              'Independent review cannot carry trusted-publisher provenance.',
            );
        } else if (route === 'trusted_publisher') {
          if (!isRecord(provenance))
            issue(
              issues,
              'editorial.trusted_publisher',
              'Trusted-publisher review requires publisher provenance.',
            );
          else {
            for (const key of Object.keys(provenance))
              if (
                ![
                  'publisher_id',
                  'publisher_name',
                  'trusted_rss_url',
                  'article_url',
                  'article_host',
                  'verified_at',
                  'safety_gates',
                ].includes(key)
              )
                issue(
                  issues,
                  `editorial.trusted_publisher.${key}`,
                  'Unknown field.',
                );
            text(
              provenance.publisher_id,
              'editorial.trusted_publisher.publisher_id',
              64,
              issues,
            );
            text(
              provenance.publisher_name,
              'editorial.trusted_publisher.publisher_name',
              100,
              issues,
            );
            for (const key of ['trusted_rss_url', 'article_url'] as const)
              if (!isHttpUrl(provenance[key]))
                issue(
                  issues,
                  `editorial.trusted_publisher.${key}`,
                  'Expected a public HTTP(S) URL.',
                );
            if (
              typeof provenance.article_host !== 'string' ||
              !/^[a-z0-9.-]{1,253}$/.test(provenance.article_host)
            )
              issue(
                issues,
                'editorial.trusted_publisher.article_host',
                'Expected a normalized article hostname.',
              );
            else if (
              isHttpUrl(provenance.article_url) &&
              new URL(provenance.article_url).hostname !==
                provenance.article_host
            )
              issue(
                issues,
                'editorial.trusted_publisher.article_host',
                'Must match the verified article URL hostname exactly.',
              );
            timestamp(
              provenance.verified_at,
              'editorial.trusted_publisher.verified_at',
              issues,
            );
            const gates = provenance.safety_gates;
            if (
              !isRecord(gates) ||
              Object.keys(gates).length !== 3 ||
              gates.publisher_identity !== true ||
              gates.safe_retrieval !== true ||
              gates.sensitive_content !== 'clear'
            )
              issue(
                issues,
                'editorial.trusted_publisher.safety_gates',
                'Trusted publisher safety gates must be explicit and clear.',
              );
          }
        }
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
    if (
      input.version === PUBLICATION_INTENT_V2_VERSION &&
      isRecord(input.editorial) &&
      input.editorial.review_route === 'trusted_publisher' &&
      isRecord(input.editorial.trusted_publisher) &&
      isHttpUrl(input.editorial.trusted_publisher.article_url) &&
      post.value.canonical_url !== null &&
      normalizePublicationUrl(post.value.canonical_url) !==
        normalizePublicationUrl(input.editorial.trusted_publisher.article_url)
    )
      issue(
        issues,
        'post.canonical_url',
        'Must equal the trusted publisher verified article URL.',
      );
  }
  if (
    !issues.length &&
    input.content_hash !==
      contentHashForPublicationIntent(
        input as unknown as UnsignedPublicationIntent,
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
