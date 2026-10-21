import {
  CONTENT_LIMITS,
  validateCreatePostInput,
} from '../shared/contracts.ts';
import type { CreatePostInput } from '../shared/contracts.ts';
import { ApiError, invalid } from './errors.ts';
import { isTikTokUrl, tikTokVideoId } from '../shared/media.ts';
import { validatePublicationAudit } from '../shared/publication-audit.ts';
import type { PublicationAudit } from '../shared/publication-audit.ts';

export interface PublicationInput {
  post: CreatePostInput;
  audit: PublicationAudit | null;
}

/** Authenticated writers may supply resolved metadata, but never an unchecked identity. */
export function publicationIdentity(input: CreatePostInput): CreatePostInput {
  const originalId = tikTokVideoId(input.url);
  const embed = input.embed;
  const embedId =
    embed?.kind === 'provider' && embed.provider === 'tiktok'
      ? tikTokVideoId(embed.url)
      : null;
  if (
    embed?.kind === 'provider' &&
    embed.provider === 'tiktok' &&
    (!embedId || embed.id !== embedId || !isTikTokUrl(input.url))
  )
    invalid(
      'TikTok metadata requires a matching canonical video URL and TikTok original.',
      'embed',
    );
  if (originalId && embedId && originalId !== embedId)
    invalid('TikTok original and embed identify different videos.', 'embed.id');
  const id = originalId ?? embedId;
  if (id && embed?.kind === 'provider' && embed.provider !== 'tiktok')
    invalid(
      'TikTok publications require matching TikTok embed metadata.',
      'embed.provider',
    );
  const canonicalId = tikTokVideoId(input.canonical_url);
  if (id && canonicalId && canonicalId !== id)
    invalid('TikTok canonical hint identifies another video.', 'canonical_url');
  if (id) {
    if (input.source_item_id !== null && input.source_item_id !== id)
      invalid(
        'TikTok source_item_id must agree with the verified video ID.',
        'source_item_id',
      );
    return { ...input, source: 'TikTok', source_item_id: id };
  }
  if (input.source.toLowerCase() === 'tiktok' && input.source_item_id !== null)
    invalid(
      'TikTok identity requires a verified canonical video URL.',
      'source_item_id',
    );
  return input;
}

/** Count encoded bytes while streaming, including when Content-Length is absent or false. */
export async function readBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const declared = request.headers.get('Content-Length');
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes)
    throw new ApiError('PAYLOAD_TOO_LARGE', 'Request body is too large.', 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new ApiError(
          'PAYLOAD_TOO_LARGE',
          'Request body is too large.',
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
export async function createPublicationInput(
  request: Request,
): Promise<PublicationInput> {
  if (
    !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(
      request.headers.get('Content-Type') ?? '',
    )
  )
    throw new ApiError(
      'UNSUPPORTED_MEDIA_TYPE',
      'Expected application/json with UTF-8 encoding.',
      415,
    );
  const bytes = await readBody(request, CONTENT_LIMITS.request_bytes);
  let data: unknown;
  try {
    data = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
    );
  } catch {
    throw new ApiError(
      'INVALID_JSON',
      'Request body is not valid UTF-8 JSON.',
      400,
    );
  }
  const result = validateCreatePostInput(data);
  if (!result.valid)
    throw new ApiError(
      'VALIDATION_ERROR',
      'Invalid publication.',
      400,
      result.issues,
    );
  const header = request.headers.get('X-WAAGD-Publication-Audit');
  let audit: PublicationAudit | null = null;
  if (header !== null) {
    try {
      const value = JSON.parse(header) as unknown;
      if (!validatePublicationAudit(value)) throw new Error();
      audit = value;
    } catch {
      invalid('Invalid trusted Publisher audit envelope.', 'audit');
    }
  }
  return {
    post: publicationIdentity(result.value),
    audit,
  };
}

/** Backwards-compatible raw post parser for tests and local callers. */
export async function createInput(request: Request): Promise<CreatePostInput> {
  return (await createPublicationInput(request)).post;
}
export async function validateDelete(
  request: Request,
  params: URLSearchParams,
): Promise<void> {
  if (params.size)
    invalid('DELETE does not accept query parameters.', '$query');
  // Stop at the first non-empty chunk; any actual body violates the contract.
  if (request.body) {
    const reader = request.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value.byteLength) {
          await reader.cancel();
          invalid('DELETE does not accept a request body.', '$');
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
