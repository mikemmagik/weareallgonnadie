import { validateCreatePostInput } from '../../shared/contracts.ts';
import type {
  CreatePostInput,
  CreatePostResult,
  Post,
  DeletePostResult,
} from '../../shared/contracts.ts';
import { retryRequest } from './http.ts';
import type { Http } from './http.ts';

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid object.');
  return value as Record<string, unknown>;
}
export function parsePost(value: unknown): Post {
  const row = record(value);
  const { id, published_at, deleted_at, ...content } = row;
  const validated = validateCreatePostInput(content);
  if (
    !validated.valid ||
    typeof id !== 'string' ||
    !UUID.test(id) ||
    typeof published_at !== 'string' ||
    !Number.isFinite(Date.parse(published_at)) ||
    !(
      deleted_at === null ||
      (typeof deleted_at === 'string' &&
        Number.isFinite(Date.parse(deleted_at)))
    )
  )
    throw new Error('Invalid API post.');
  return { ...validated.value, id, published_at, deleted_at };
}
export class Api {
  base: string;
  token: string;
  http: Http;
  sleep: ((ms: number) => Promise<void>) | undefined;
  constructor(
    base: string,
    token: string,
    http: Http = fetch,
    sleep?: (ms: number) => Promise<void>,
  ) {
    const url = new URL(base);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      )
    )
      throw new Error('API must be an HTTPS origin or local loopback HTTP.');
    if (!token.trim()) throw new Error('API token is required.');
    this.base = url.origin;
    this.token = token;
    this.http = http;
    this.sleep = sleep;
  }
  async request(
    path: string,
    method = 'GET',
    payload?: CreatePostInput,
  ): Promise<unknown> {
    const response = await retryRequest(
      this.http,
      `${this.base}${path}`,
      {
        method,
        redirect: 'error',
        headers:
          method === 'GET'
            ? {}
            : {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json',
              },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      },
      this.sleep,
    );
    const envelope = record(await response.json());
    if (envelope.ok !== true) throw new Error('Invalid API success envelope.');
    return envelope.data;
  }
  async publish(payload: CreatePostInput): Promise<CreatePostResult> {
    if (
      !validateCreatePostInput(payload).valid ||
      Buffer.byteLength(JSON.stringify(payload)) > 256 * 1024
    )
      throw new Error('Invalid publication payload.');
    const result = record(await this.request('/api/posts', 'POST', payload));
    const post = parsePost(result.post);
    if (result.outcome === 'created') return { outcome: 'created', post };
    if (
      result.outcome === 'duplicate' &&
      (result.matched_by === 'canonical_url' ||
        result.matched_by === 'source_item_id')
    )
      return { outcome: 'duplicate', matched_by: result.matched_by, post };
    throw new Error('Invalid publication result.');
  }
  async delete(id: string): Promise<DeletePostResult> {
    if (!UUID.test(id)) throw new Error('Invalid publication ID.');
    const result = record(await this.request(`/api/posts/${id}`, 'DELETE'));
    if (
      result.id !== id ||
      typeof result.deleted_at !== 'string' ||
      !Number.isFinite(Date.parse(result.deleted_at))
    )
      throw new Error('Invalid deletion response.');
    return { id, deleted_at: result.deleted_at };
  }
  async posts(since?: Date): Promise<Post[]> {
    const posts: Post[] = [];
    const cursors = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < 1000; page++) {
      const result = record(
        await this.request(
          `/api/posts?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        ),
      );
      if (
        !Array.isArray(result.posts) ||
        !(result.next_cursor === null || typeof result.next_cursor === 'string')
      )
        throw new Error('Invalid API page.');
      const rows = result.posts.map(parsePost);
      posts.push(
        ...rows.filter(
          (post) =>
            post.deleted_at === null &&
            (!since || new Date(post.published_at) >= since),
        ),
      );
      if (
        result.next_cursor === null ||
        (since &&
          rows.length > 0 &&
          rows.every((post) => new Date(post.published_at) < since))
      )
        return posts;
      if (!result.next_cursor || cursors.has(result.next_cursor))
        throw new Error('Repeated cursor.');
      cursor = result.next_cursor;
      cursors.add(cursor);
    }
    throw new Error('Pagination bound reached; refusing partial feed.');
  }
  siteUrl(id: string): string {
    return `${this.base}/?post=${encodeURIComponent(id)}`;
  }
}
