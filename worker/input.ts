import {
  CONTENT_LIMITS,
  validateCreatePostInput,
} from '../shared/contracts.ts';
import type { CreatePostInput } from '../shared/contracts.ts';
import { ApiError, invalid } from './errors.ts';

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
export async function createInput(request: Request): Promise<CreatePostInput> {
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
  return result.value;
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
