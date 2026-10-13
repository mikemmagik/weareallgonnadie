import type { Env } from './env.ts';
import { authenticate } from './auth.ts';
import { isPostId, listQuery } from './cursor.ts';
import { ApiError, errorResponse, invalid, json } from './errors.ts';
import { createInput, validateDelete } from './input.ts';
import { createPost, deletePost, getPost, listPosts } from './store.ts';
import { secureResponse } from './security.ts';
import { redditAdapter } from './reddit.ts';

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (pathname !== '/api' && !pathname.startsWith('/api/'))
    return env.ASSETS.fetch(request);
  try {
    const collection = pathname === '/api/posts';
    const item = /^\/api\/posts\/([^/]+)$/.exec(pathname);
    const allowed = collection
      ? ['GET', 'POST']
      : item
        ? ['GET', 'DELETE']
        : null;
    if (!allowed) throw new ApiError('NOT_FOUND', 'API route not found.', 404);
    if (!allowed.includes(request.method))
      throw new ApiError(
        'METHOD_NOT_ALLOWED',
        'Method not allowed.',
        405,
        undefined,
        { Allow: allowed.join(', ') },
      );
    if (request.method === 'POST' || request.method === 'DELETE')
      await authenticate(request, env.API_WRITE_TOKEN);
    if (collection && request.method === 'GET') {
      const { limit, cursor } = listQuery(url.searchParams);
      if (!env.DB)
        throw new ApiError(
          'SERVICE_UNAVAILABLE',
          'Database is unavailable.',
          503,
        );
      return json({ ok: true, data: await listPosts(env.DB, limit, cursor) });
    }
    if (collection) {
      const input = await createInput(request);
      if (!env.DB)
        throw new ApiError(
          'SERVICE_UNAVAILABLE',
          'Database is unavailable.',
          503,
        );
      const data = await createPost(env.DB, input);
      return json(
        { ok: true, data },
        data.outcome === 'created' ? 201 : 200,
        data.outcome === 'created'
          ? { Location: `/api/posts/${data.post.id}` }
          : undefined,
      );
    }
    const id = item?.[1];
    if (!isPostId(id)) invalid('Expected a lowercase UUID v4.', 'id');
    if (request.method === 'DELETE') {
      await validateDelete(request, url.searchParams);
      if (!env.DB)
        throw new ApiError(
          'SERVICE_UNAVAILABLE',
          'Database is unavailable.',
          503,
        );
      return json({ ok: true, data: await deletePost(env.DB, id) });
    }
    if (!env.DB)
      throw new ApiError(
        'SERVICE_UNAVAILABLE',
        'Database is unavailable.',
        503,
      );
    return json({ ok: true, data: await getPost(env.DB, id) });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname === '/embed/reddit')
      return redditAdapter(request);
    return secureResponse(await route(request, env));
  },
};
