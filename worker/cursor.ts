import {
  CONTRACT_VERSION,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from '../shared/contracts.ts';
import type { PostsCursorPayload } from '../shared/contracts.ts';
import { ApiError, invalid } from './errors.ts';

export function isPostId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value,
    )
  );
}
export function isTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
export function encodeCursor(
  value: Pick<PostsCursorPayload, 'published_at' | 'id'>,
): string {
  return btoa(
    JSON.stringify({
      v: CONTRACT_VERSION,
      published_at: value.published_at,
      id: value.id,
    }),
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
export function decodeCursor(value: string): PostsCursorPayload {
  try {
    if (!value || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error();
    const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    // Reject noncanonical base64 encodings, invalid UTF-8, and extra payload fields.
    if (
      btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !==
      value
    )
      throw new Error();
    const payload: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        Uint8Array.from(raw, (char) => char.charCodeAt(0)),
      ),
    );
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    )
      throw new Error();
    const data = payload as Record<string, unknown>;
    if (
      Object.keys(data).length !== 3 ||
      data.v !== CONTRACT_VERSION ||
      !isPostId(data.id) ||
      !isTimestamp(data.published_at)
    )
      throw new Error();
    return {
      v: CONTRACT_VERSION,
      id: data.id,
      published_at: data.published_at,
    };
  } catch {
    throw new ApiError('INVALID_CURSOR', 'Invalid pagination cursor.', 400);
  }
}
export function listQuery(params: URLSearchParams): {
  limit: number;
  cursor: PostsCursorPayload | null;
} {
  for (const key of params.keys()) {
    if (!['limit', 'cursor'].includes(key) || params.getAll(key).length !== 1)
      invalid('Unknown or repeated query parameter.', key);
  }
  const raw = params.get('limit');
  const limit = raw === null ? DEFAULT_PAGE_LIMIT : Number(raw);
  if (
    (raw !== null && !/^[0-9]+$/.test(raw)) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_PAGE_LIMIT
  )
    invalid('Limit must be an integer from 1 to 100.', 'limit');
  const cursor = params.get('cursor');
  return { limit, cursor: cursor === null ? null : decodeCursor(cursor) };
}
