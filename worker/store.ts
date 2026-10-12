import type { D1Database } from '@cloudflare/workers-types';
import type {
  CreatePostInput,
  CreatePostResult,
  DeletePostResult,
  Post,
  PostsCursorPayload,
  PostsPage,
} from '../shared/contracts.ts';
import { CONTENT_LIMITS } from '../shared/contracts.ts';
import { encodeCursor } from './cursor.ts';
import { ApiError } from './errors.ts';
import { canonicalizeUrl } from './url.ts';
import { publicationIdentity } from './input.ts';
import { tikTokVideoId } from '../shared/media.ts';

// Old immutable rows can carry the verified embed ID under a different namespace.
// Block insertion on any such claim, then validate it before returning a duplicate.
// The guard and lookup run in the insertion transaction, including deleted rows.
const LEGACY_TIKTOK = `(lower(source) = 'tiktok' AND source_item_id = ?)
  OR (CASE WHEN json_valid(embed) THEN json_extract(embed, '$.kind') = 'provider'
    AND json_extract(embed, '$.provider') = 'tiktok' AND json_extract(embed, '$.id') = ? ELSE 0 END)
  OR (substr(lower(url), 1, instr(lower(url), '/@') - 1) IN (
    'https://tiktok.com', 'https://www.tiktok.com', 'https://m.tiktok.com',
    'http://tiktok.com', 'http://www.tiktok.com', 'http://m.tiktok.com')
    AND instr(url, '/video/' || ?) > 0
    AND substr(url, instr(url, '/video/' || ?) + 7 + length(?), 1) IN ('', '/', '?', '#'))`;

type PostRow = Omit<Post, 'preview' | 'embed' | 'references'> & {
  preview: string | null;
  embed: string | null;
  references: string;
};
function post(row: PostRow): Post {
  return {
    ...row,
    preview: row.preview === null ? null : JSON.parse(row.preview),
    embed: row.embed === null ? null : JSON.parse(row.embed),
    references: JSON.parse(row.references),
  } as Post;
}
export async function listPosts(
  db: D1Database,
  limit: number,
  cursor: PostsCursorPayload | null,
): Promise<PostsPage> {
  const statement = cursor
    ? db
        .prepare(
          'SELECT * FROM posts WHERE deleted_at IS NULL AND (published_at, id) < (?, ?) ORDER BY published_at DESC, id DESC LIMIT ?',
        )
        .bind(cursor.published_at, cursor.id, limit + 1)
    : db
        .prepare(
          'SELECT * FROM posts WHERE deleted_at IS NULL ORDER BY published_at DESC, id DESC LIMIT ?',
        )
        .bind(limit + 1);
  const result = await statement.all<PostRow>();
  if (!result.success) throw new Error('Database read failed');
  const rows = result.results.slice(0, limit);
  const last = rows.at(-1);
  return {
    posts: rows.map(post),
    next_cursor:
      result.results.length > limit && last ? encodeCursor(last) : null,
  };
}
export async function getPost(db: D1Database, id: string): Promise<Post> {
  const row = await db
    .prepare('SELECT * FROM posts WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<PostRow>();
  if (!row) throw new ApiError('NOT_FOUND', 'Publication not found.', 404);
  return post(row);
}
export async function createPost(
  db: D1Database,
  input: CreatePostInput,
): Promise<CreatePostResult> {
  input = publicationIdentity(input);
  const tikTokId = input.source === 'TikTok' ? input.source_item_id : null;
  const legacyParams = tikTokId
    ? [tikTokId, tikTokId, tikTokId, tikTokId, tikTokId]
    : [];
  const id = crypto.randomUUID();
  const canonical = canonicalizeUrl(input.canonical_url ?? input.url);
  // URL serialization can expand Unicode beyond the approved field limit.
  if (canonical !== null && canonical.length > CONTENT_LIMITS.url)
    throw new ApiError(
      'VALIDATION_ERROR',
      'Normalized canonical URL is too long.',
      400,
      [
        {
          path: 'canonical_url',
          message: 'Normalized URL exceeds 2048 characters.',
        },
      ],
    );
  const results = await db.batch<PostRow>([
    db
      .prepare(
        `INSERT INTO posts (id, type, url, canonical_url, source_item_id, title, source, origin, preview, embed, body, "references", published_at, deleted_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL
      ${tikTokId ? `WHERE NOT EXISTS (SELECT 1 FROM posts WHERE ${LEGACY_TIKTOK})` : 'WHERE 1'}
      ON CONFLICT(canonical_url) WHERE canonical_url IS NOT NULL DO NOTHING
      ON CONFLICT(source, source_item_id) WHERE source_item_id IS NOT NULL DO NOTHING
      RETURNING *`,
      )
      .bind(
        id,
        input.type,
        input.url,
        canonical,
        input.source_item_id,
        input.title,
        input.source,
        input.origin,
        input.preview === null ? null : JSON.stringify(input.preview),
        input.embed === null ? null : JSON.stringify(input.embed),
        input.body,
        JSON.stringify(input.references),
        new Date().toISOString(),
        ...legacyParams,
      ),
    // Same transaction, primary database: duplicate lookup cannot race an insertion/deletion.
    db
      .prepare(
        `SELECT * FROM posts WHERE canonical_url = ? AND canonical_url IS NOT NULL
      UNION SELECT * FROM posts WHERE source = ? AND source_item_id = ? AND source_item_id IS NOT NULL
      ${tikTokId ? `UNION SELECT * FROM posts WHERE ${LEGACY_TIKTOK}` : ''}`,
      )
      .bind(canonical, input.source, input.source_item_id, ...legacyParams),
  ]);
  if (results.length !== 2 || results.some((result) => !result.success))
    throw new Error('Database write failed');
  const created = results[0]?.results[0];
  if (created) return { outcome: 'created', post: post(created) };
  const matches = results[1]?.results ?? [];
  if (matches.length > 1)
    throw new ApiError(
      'VALIDATION_ERROR',
      'Canonical URL and source item ID identify different publications.',
      400,
      [
        { path: 'canonical_url', message: 'Conflicts with source_item_id.' },
        { path: 'source_item_id', message: 'Conflicts with canonical_url.' },
      ],
    );
  const match = matches[0];
  if (!match) throw new Error('Duplicate lookup failed');
  if (tikTokId) {
    const legacy = post(match);
    const originalId = tikTokVideoId(legacy.url);
    const embedId =
      legacy.embed?.kind === 'provider' &&
      legacy.embed.provider === 'tiktok' &&
      legacy.embed.id === tikTokId &&
      tikTokVideoId(legacy.embed.url) === tikTokId;
    if (
      !(originalId === tikTokId || embedId) ||
      (originalId && originalId !== tikTokId)
    )
      throw new ApiError(
        'VALIDATION_ERROR',
        'Existing TikTok identity requires data review.',
        400,
      );
  }
  return {
    outcome: 'duplicate',
    post: post(match),
    matched_by:
      canonical !== null && match.canonical_url === canonical
        ? 'canonical_url'
        : 'source_item_id',
  };
}
export async function deletePost(
  db: D1Database,
  id: string,
): Promise<DeletePostResult> {
  const result = await db
    .prepare(
      'UPDATE posts SET deleted_at = COALESCE(deleted_at, ?) WHERE id = ? RETURNING id, deleted_at',
    )
    .bind(new Date().toISOString(), id)
    .first<DeletePostResult>();
  if (!result) throw new ApiError('NOT_FOUND', 'Publication not found.', 404);
  return result;
}
