import type { ApiErrorResponse, ApiErrorCode } from '../shared/contracts.ts';
import type { Env } from './env.ts';

function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  headers?: Record<string, string>,
): Response {
  const body: ApiErrorResponse = { ok: false, error: { code, message } };
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname;
    if (pathname !== '/api' && !pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const allowedMethods =
      pathname === '/api/posts'
        ? ['GET', 'POST']
        : /^\/api\/posts\/[^/]+$/.test(pathname)
          ? ['GET', 'DELETE']
          : null;

    if (!allowedMethods) {
      return errorResponse('NOT_FOUND', 'API route not found.', 404);
    }
    if (!allowedMethods.includes(request.method)) {
      return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, {
        Allow: allowedMethods.join(', '),
      });
    }

    // No database reads, writes, or authentication business logic in this scaffold.
    return errorResponse(
      'NOT_IMPLEMENTED',
      'This endpoint is reserved; implementation is pending.',
      501,
    );
  },
};
