/** Public boundary shared by frontend, Worker, and HTTP-only automation clients.
 * FIX-002: verified TikTok publications persist source="TikTok" and the URL's
 * numeric video ID as source_item_id; Worker ingestion enforces agreement.
 * Stored legacy content retains its original fields and is checked at render time.
 */
export const CONTRACT_VERSION = 1 as const;
export const POST_TYPES = ['news', 'video', 'meme', 'changelog'] as const;
export const POST_ORIGINS = ['auto', 'telegram'] as const;
export const EMBED_PROVIDERS = [
  'youtube',
  'reddit',
  'tiktok',
  'instagram',
] as const;
export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;
export type PostType = (typeof POST_TYPES)[number];
export type PostOrigin = (typeof POST_ORIGINS)[number];
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];
export type PostId = string; // Server-generated lowercase UUID v4.
export type UtcTimestamp = string; // YYYY-MM-DDTHH:mm:ss.sssZ, server generated.
export type Cursor = string; // Opaque to clients; never offset pagination.
export interface Preview {
  image_url: string;
  alt_text: string | null;
}
/** No raw HTML, scripts, iframe markup, or caller-selected iframe source. */
export type Embed =
  | { kind: 'provider'; provider: EmbedProvider; id: string; url: string }
  | { kind: 'link'; url: string; label: string | null };
export interface Reference {
  url: string;
  title: string | null;
}
interface PostContent {
  canonical_url: string | null;
  source_item_id: string | null;
  title: string;
  source: string;
  origin: PostOrigin;
  preview: Preview | null;
  embed: Embed | null;
  body: string | null; // Markdown/plain text, never trusted HTML.
  references: Reference[];
}
export type CreatePostInput = PostContent &
  (
    | { type: Exclude<PostType, 'changelog'>; url: string }
    | { type: 'changelog'; url: string | null; body: string }
  );
export type Post = CreatePostInput & {
  id: PostId;
  published_at: UtcTimestamp;
  deleted_at: UtcTimestamp | null;
};
export interface ListPostsQuery {
  limit?: number;
  cursor?: Cursor;
}
/** Logical contents of the versioned base64url cursor; clients treat it as opaque. */
export interface PostsCursorPayload {
  v: typeof CONTRACT_VERSION;
  published_at: UtcTimestamp;
  id: PostId;
}
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}
export interface PostsPage {
  posts: Post[];
  next_cursor: Cursor | null;
}
export type DuplicateMatch = 'canonical_url' | 'source_item_id';
export type CreatePostResult =
  | { outcome: 'created'; post: Post }
  | { outcome: 'duplicate'; post: Post; matched_by: DuplicateMatch };
export interface DeletePostResult {
  id: PostId;
  deleted_at: UtcTimestamp;
}
export type ApiErrorCode =
  | 'INVALID_JSON'
  | 'VALIDATION_ERROR'
  | 'INVALID_CURSOR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'NOT_IMPLEMENTED';
export interface ValidationIssue {
  path: string;
  message: string;
}
export interface ApiErrorResponse {
  ok: false;
  error: { code: ApiErrorCode; message: string; details?: ValidationIssue[] };
}
export type ApiResponse<T> = ApiSuccess<T> | ApiErrorResponse;
export type ListPostsResponse = ApiResponse<PostsPage>;
export type GetPostResponse = ApiResponse<Post>;
export type CreatePostResponse = ApiResponse<CreatePostResult>;
export type DeletePostResponse = ApiResponse<DeletePostResult>;
export type ValidationResult<T> =
  { valid: true; value: T } | { valid: false; issues: ValidationIssue[] };
export const CONTENT_LIMITS = {
  url: 2048,
  title: 300,
  source: 100,
  source_item_id: 256,
  body: 100_000,
  references: 100,
  label: 300,
  embed_id: 256,
  request_bytes: 256 * 1024,
} as const;
export function isHttpUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > CONTENT_LIMITS.url ||
    value.trim() !== value
  )
    return false;
  try {
    const url = new URL(value);
    return (
      /^https?:\/\//i.test(value) &&
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
/** Duplicate identity only: retain content parameters and their original encoding/order. */
export function normalizePublicationUrl(value: string): string {
  if (!isHttpUrl(value)) throw new Error('Invalid HTTP(S) URL.');
  const url = new URL(value);
  url.hash = '';
  const tracking = new Set([
    'fbclid',
    'gclid',
    'dclid',
    'msclkid',
    'mc_cid',
    'mc_eid',
  ]);
  const query = url.search
    .slice(1)
    .split('&')
    .filter((part) => {
      const key = [...new URLSearchParams(part).keys()][0]?.toLowerCase() ?? '';
      return !key.startsWith('utm_') && !tracking.has(key);
    });
  url.search = query.join('&');
  return url.toString();
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const PROVIDER_HOSTS: Record<EmbedProvider, readonly string[]> = {
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
  reddit: ['reddit.com', 'www.reddit.com', 'old.reddit.com', 'redd.it'],
  tiktok: [
    'tiktok.com',
    'www.tiktok.com',
    'm.tiktok.com',
    'vm.tiktok.com',
    'vt.tiktok.com',
  ],
  instagram: ['instagram.com', 'www.instagram.com'],
};
/** Validate the wire input without canonicalizing URLs or doing endpoint business logic. */
export function validateCreatePostInput(
  input: unknown,
): ValidationResult<CreatePostInput> {
  const issues: ValidationIssue[] = [];
  const issue = (path: string, message: string) => {
    issues.push({ path, message });
  };
  if (!isRecord(input))
    return {
      valid: false,
      issues: [{ path: '$', message: 'Expected an object.' }],
    };
  const keys = (
    value: Record<string, unknown>,
    allowed: string[],
    path = '',
  ) => {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key))
        issue(path ? `${path}.${key}` : key, 'Unknown field.');
    }
  };
  const text = (
    value: unknown,
    path: string,
    max: number,
    nullable = false,
  ) => {
    if (nullable && value === null) return;
    if (typeof value !== 'string' || !value.trim() || value.length > max)
      issue(
        path,
        `Expected non-empty text up to ${max} characters${nullable ? ' or null' : ''}.`,
      );
  };
  const url = (value: unknown, path: string, nullable = false) => {
    if (nullable && value === null) return;
    if (!isHttpUrl(value))
      issue(path, 'Expected an absolute HTTP(S) URL without credentials.');
  };
  keys(input, [
    'url',
    'canonical_url',
    'source_item_id',
    'title',
    'source',
    'type',
    'origin',
    'preview',
    'embed',
    'body',
    'references',
  ]);
  if (!POST_TYPES.includes(input.type as PostType))
    issue('type', 'Unsupported post type.');
  if (!POST_ORIGINS.includes(input.origin as PostOrigin))
    issue('origin', 'Unsupported origin.');
  url(input.url, 'url', input.type === 'changelog');
  url(input.canonical_url, 'canonical_url', true);
  if (input.url === null && input.canonical_url !== null)
    issue('canonical_url', 'Must be null when url is null.');
  text(input.title, 'title', CONTENT_LIMITS.title);
  text(input.source, 'source', CONTENT_LIMITS.source);
  text(
    input.source_item_id,
    'source_item_id',
    CONTENT_LIMITS.source_item_id,
    true,
  );
  text(input.body, 'body', CONTENT_LIMITS.body, input.type !== 'changelog');
  if (input.preview !== null) {
    if (!isRecord(input.preview))
      issue('preview', 'Expected preview metadata or null.');
    else {
      keys(input.preview, ['image_url', 'alt_text'], 'preview');
      url(input.preview.image_url, 'preview.image_url');
      text(
        input.preview.alt_text,
        'preview.alt_text',
        CONTENT_LIMITS.label,
        true,
      );
    }
  }
  if (input.embed !== null) {
    if (!isRecord(input.embed))
      issue('embed', 'Expected structured embed metadata or null.');
    else {
      url(input.embed.url, 'embed.url');
      if (input.embed.kind === 'link') {
        keys(input.embed, ['kind', 'url', 'label'], 'embed');
        text(input.embed.label, 'embed.label', CONTENT_LIMITS.label, true);
      } else if (input.embed.kind === 'provider') {
        keys(input.embed, ['kind', 'provider', 'id', 'url'], 'embed');
        text(input.embed.id, 'embed.id', CONTENT_LIMITS.embed_id);
        if (
          typeof input.embed.id === 'string' &&
          !/^[a-zA-Z0-9_/-]+$/.test(input.embed.id)
        )
          issue('embed.id', 'Invalid provider identifier.');
        if (!EMBED_PROVIDERS.includes(input.embed.provider as EmbedProvider))
          issue('embed.provider', 'Unsupported provider.');
        else if (
          isHttpUrl(input.embed.url) &&
          !PROVIDER_HOSTS[input.embed.provider as EmbedProvider].includes(
            new URL(input.embed.url).hostname,
          )
        )
          issue(
            'embed.url',
            'URL hostname does not match the provider allowlist.',
          );
      } else issue('embed.kind', 'Expected provider or link.');
    }
  }
  if (
    !Array.isArray(input.references) ||
    input.references.length > CONTENT_LIMITS.references
  )
    issue(
      'references',
      `Expected an array of at most ${CONTENT_LIMITS.references} references.`,
    );
  else
    input.references.forEach((reference: unknown, index: number) => {
      const path = `references.${index}`;
      if (!isRecord(reference)) issue(path, 'Expected reference metadata.');
      else {
        keys(reference, ['url', 'title'], path);
        url(reference.url, `${path}.url`);
        text(reference.title, `${path}.title`, CONTENT_LIMITS.label, true);
      }
    });
  return issues.length
    ? { valid: false, issues }
    : { valid: true, value: input as unknown as CreatePostInput };
}
