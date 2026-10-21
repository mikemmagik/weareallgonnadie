/** Internal Publisher-to-Worker audit envelope. It is accepted only on the
 * already authenticated website write path; it is not a public frontend API. */
export interface PublicationAudit {
  intent_id: string;
  intent_version: 1 | 2;
  content_hash: string;
  semantic_identity: string;
  review_route: 'independently_verified' | 'trusted_publisher' | null;
  editorial: Record<string, unknown> | null;
}

const INTENT_ID = /^[a-z][a-z0-9:_-]{7,255}$/;
const HASH = /^[a-f0-9]{64}$/;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validatePublicationAudit(
  value: unknown,
): value is PublicationAudit {
  if (
    !object(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          'intent_id',
          'intent_version',
          'content_hash',
          'semantic_identity',
          'review_route',
          'editorial',
        ].includes(key),
    )
  )
    return false;
  if (
    typeof value.intent_id !== 'string' ||
    !INTENT_ID.test(value.intent_id) ||
    (value.intent_version !== 1 && value.intent_version !== 2) ||
    typeof value.content_hash !== 'string' ||
    !HASH.test(value.content_hash) ||
    typeof value.semantic_identity !== 'string' ||
    !HASH.test(value.semantic_identity) ||
    !(value.editorial === null || object(value.editorial))
  )
    return false;
  return value.intent_version === 1
    ? value.review_route === null
    : value.review_route === 'independently_verified' ||
        value.review_route === 'trusted_publisher';
}
