import {
  DEFAULT_PAGE_LIMIT,
  validateCreatePostInput,
} from '../../shared/contracts.ts';
import type { Cursor, Post, PostsPage } from '../../shared/contracts.ts';

export class FeedError extends Error {
  readonly code: string;
  constructor(code = 'UNAVAILABLE') {
    super('The feed is temporarily unavailable.');
    this.code = code;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate unknown JSON at the browser boundary with the shared wire validator. */
export function parsePage(value: unknown): PostsPage {
  if (!record(value)) throw new FeedError('INVALID_RESPONSE');
  if (value.ok === false) {
    throw new FeedError(
      record(value.error) && typeof value.error.code === 'string'
        ? value.error.code
        : 'UNAVAILABLE',
    );
  }
  if (value.ok !== true || !record(value.data))
    throw new FeedError('INVALID_RESPONSE');
  const { posts, next_cursor } = value.data;
  if (
    !Array.isArray(posts) ||
    posts.length > 100 ||
    !(
      next_cursor === null ||
      (typeof next_cursor === 'string' &&
        next_cursor.length > 0 &&
        next_cursor.length <= 1024)
    )
  ) {
    throw new FeedError('INVALID_RESPONSE');
  }
  const parsed = posts.map((post: unknown): Post => {
    if (!record(post)) throw new FeedError('INVALID_RESPONSE');
    const { id, published_at, deleted_at, ...content } = post;
    const timestamp = (value: unknown) =>
      typeof value === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value;
    if (
      typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        id,
      ) ||
      !timestamp(published_at) ||
      !(deleted_at === null || timestamp(deleted_at))
    ) {
      throw new FeedError('INVALID_RESPONSE');
    }
    // Defensive title fallback; no new fields or private alternative contract.
    if (
      content.title === undefined ||
      (typeof content.title === 'string' && !content.title.trim())
    ) {
      content.title = 'Untitled transmission';
    }
    const validated = validateCreatePostInput(content);
    if (!validated.valid) throw new FeedError('INVALID_RESPONSE');
    return { ...validated.value, id, published_at, deleted_at } as Post;
  });
  return {
    posts: parsed.filter((post) => post.deleted_at === null),
    next_cursor,
  };
}

export async function fetchPage(cursor: Cursor | null): Promise<PostsPage> {
  const query = new URLSearchParams({ limit: String(DEFAULT_PAGE_LIMIT) });
  if (cursor !== null) query.set('cursor', cursor);
  const response = await fetch(`/api/posts?${query}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new FeedError('INVALID_RESPONSE');
  }
  if (!response.ok) {
    if (
      record(body) &&
      body.ok === false &&
      record(body.error) &&
      typeof body.error.code === 'string'
    ) {
      throw new FeedError(body.error.code);
    }
    throw new FeedError(`HTTP_${response.status}`);
  }
  return parsePage(body);
}

/** Read a permalink through the existing item API, including ordinary API errors. */
export async function fetchPost(id: string): Promise<Post> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      id,
    )
  )
    throw new FeedError('VALIDATION_ERROR');
  const response = await fetch(`/api/posts/${id}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new FeedError('INVALID_RESPONSE');
  }
  if (!record(body)) throw new FeedError('INVALID_RESPONSE');
  if (!response.ok || body.ok !== true) {
    throw new FeedError(
      record(body.error) && typeof body.error.code === 'string'
        ? body.error.code
        : `HTTP_${response.status}`,
    );
  }
  const post = parsePage({
    ok: true,
    data: { posts: [body.data], next_cursor: null },
  }).posts[0];
  if (!post || post.id !== id) throw new FeedError('INVALID_RESPONSE');
  return post;
}

export type FeedStatus =
  'idle' | 'loading' | 'ready' | 'empty' | 'end' | 'error';
export class FeedSession {
  posts: Post[] = [];
  cursor: Cursor | null = null;
  status: FeedStatus = 'idle';
  errorCode: string | null = null;
  private readonly visited = new Set<Cursor>();

  private readonly request: (cursor: Cursor | null) => Promise<PostsPage>;
  constructor(request: (cursor: Cursor | null) => Promise<PostsPage>) {
    this.request = request;
  }

  async load(): Promise<void> {
    if (
      this.status === 'loading' ||
      this.status === 'end' ||
      this.status === 'empty'
    )
      return;
    this.status = 'loading';
    this.errorCode = null;
    try {
      const page = await this.request(this.cursor);
      if (
        page.next_cursor !== null &&
        (page.next_cursor === this.cursor || this.visited.has(page.next_cursor))
      ) {
        throw new FeedError('CURSOR_STALLED');
      }
      if (this.cursor !== null) this.visited.add(this.cursor);
      const ids = new Set(this.posts.map((post) => post.id));
      this.posts.push(
        ...page.posts.filter((post) => {
          if (post.deleted_at !== null || ids.has(post.id)) return false;
          ids.add(post.id);
          return true;
        }),
      );
      this.posts.sort(
        (a, b) =>
          b.published_at.localeCompare(a.published_at) ||
          (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      );
      this.cursor = page.next_cursor;
      this.status =
        this.cursor === null ? (this.posts.length ? 'end' : 'empty') : 'ready';
    } catch (error) {
      this.status = 'error';
      this.errorCode = error instanceof FeedError ? error.code : 'UNAVAILABLE';
    }
  }
}
