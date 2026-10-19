import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker/index.ts';
import type { Env } from '../worker/env.ts';
import { canonicalizeUrl } from '../worker/url.ts';
import { decodeCursor, encodeCursor } from '../worker/cursor.ts';
import { CONTENT_LIMITS } from '../shared/contracts.ts';

const id = '5bdac05a-6f04-4bb9-a7d7-c08530c4fb12';
function fixture(token: string | undefined = 'local-test-token') {
  let assetRequests = 0;
  const env = {
    ASSETS: {
      fetch: async () => {
        assetRequests += 1;
        return new Response('static asset');
      },
    },
    DB: new Proxy(
      {},
      {
        get() {
          throw new Error('sensitive SQL and secret: must never be exposed');
        },
      },
    ),
    ...(token === undefined ? {} : { API_WRITE_TOKEN: token }),
  } as unknown as Env;
  return { env, assetRequests: () => assetRequests };
}
async function request(path: string, init?: RequestInit, env = fixture().env) {
  return worker.fetch(new Request(`https://example.com${path}`, init), env);
}
async function error(response: Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(
    response.headers.get('content-type'),
    'application/json; charset=utf-8',
  );
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, code);
  assert.doesNotMatch(JSON.stringify(body), /sensitive SQL|local-test-token/);
}
const headers = {
  Authorization: 'Bearer local-test-token',
  'Content-Type': 'application/json',
};

test('unknown API routes remain JSON; unsupported methods include Allow', async () => {
  for (const path of [
    '/api',
    '/api/unknown',
    '/api/posts/id/nested',
    '/api/posts/',
  ])
    await error(await request(path), 404, 'NOT_FOUND');
  for (const [path, allow] of [
    ['/api/posts', 'GET, POST'],
    [`/api/posts/${id}`, 'GET, DELETE'],
  ]) {
    const response = await request(path!, { method: 'PUT' });
    await error(response, 405, 'METHOD_NOT_ALLOWED');
    assert.equal(response.headers.get('allow'), allow);
  }
});
test('non-API requests fall through to Static Assets', async () => {
  const { env, assetRequests } = fixture();
  for (const path of ['/', '/apiculture'])
    assert.equal(
      await (await request(path, undefined, env)).text(),
      'static asset',
    );
  assert.equal(assetRequests(), 2);
});
test('writes authenticate before input parsing, ID validation, and database access', async () => {
  for (const method of ['POST', 'DELETE']) {
    const path = method === 'POST' ? '/api/posts' : '/api/posts/invalid';
    for (const authorization of [
      '',
      'Basic local-test-token',
      'Bearer wrong',
      'Bearer local-test-token extra',
    ]) {
      const response = await request(path, {
        method,
        headers: { Authorization: authorization },
        body: '{',
      });
      await error(response, 401, 'UNAUTHORIZED');
      assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    }
    const env = fixture('').env;
    await error(
      await request(path, { method, headers }, env),
      503,
      'SERVICE_UNAVAILABLE',
    );
    delete env.API_WRITE_TOKEN;
    await error(
      await request(path, { method, headers }, env),
      503,
      'SERVICE_UNAVAILABLE',
    );
  }
});
test('invalid requests use the documented envelope without touching D1', async () => {
  await error(
    await request('/api/posts', { method: 'POST', headers, body: '{' }),
    400,
    'INVALID_JSON',
  );
  await error(
    await request('/api/posts', { method: 'POST', headers, body: '{}' }),
    400,
    'VALIDATION_ERROR',
  );
  for (const contentType of [
    'text/plain',
    'application/json; charset=latin1',
    '',
  ])
    await error(
      await request('/api/posts', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': contentType },
        body: '{}',
      }),
      415,
      'UNSUPPORTED_MEDIA_TYPE',
    );
  await error(
    await request('/api/posts', {
      method: 'POST',
      headers,
      body: 'é'.repeat(CONTENT_LIMITS.request_bytes / 2 + 1),
    }),
    413,
    'PAYLOAD_TOO_LARGE',
  );
  await error(
    await request('/api/posts', {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': String(CONTENT_LIMITS.request_bytes + 1),
      },
      body: '{}',
    }),
    413,
    'PAYLOAD_TOO_LARGE',
  );
  await error(
    await request('/api/posts', {
      method: 'POST',
      headers,
      body: new Uint8Array([0xff]),
    }),
    400,
    'INVALID_JSON',
  );
  await error(await request('/api/posts/invalid'), 400, 'VALIDATION_ERROR');
  await error(
    await request(`/api/posts/${id}?x=1`, { method: 'DELETE', headers }),
    400,
    'VALIDATION_ERROR',
  );
  await error(
    await request(`/api/posts/${id}`, {
      method: 'DELETE',
      headers,
      body: '{}',
    }),
    400,
    'VALIDATION_ERROR',
  );
});
test('the Worker accepts only complete URL-less news bulletins', async () => {
  const bulletin = {
    type: 'news',
    origin: 'auto',
    url: null,
    canonical_url: null,
    source_item_id: 'bulletin:2026-10-19:outage',
    title: 'The robots have misplaced Tuesday',
    source: 'Example News',
    preview: null,
    embed: null,
    body: 'No public link is available yet.',
    references: [],
  };
  // The fixture D1 intentionally throws: reaching it proves validation accepted the bulletin.
  await error(
    await request('/api/posts', {
      method: 'POST',
      headers,
      body: JSON.stringify(bulletin),
    }),
    500,
    'INTERNAL_ERROR',
  );
  for (const invalid of [
    { source_item_id: null },
    { body: null },
    { canonical_url: 'https://example.com/news' },
    {
      preview: {
        image_url: 'https://example.com/image.jpg',
        alt_text: null,
      },
    },
    {
      embed: {
        kind: 'link',
        url: 'https://example.com/news',
        label: null,
      },
    },
  ])
    await error(
      await request('/api/posts', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...bulletin, ...invalid }),
      }),
      400,
      'VALIDATION_ERROR',
    );
});
test('pagination validates query parameters and cursor contents', async () => {
  for (const query of [
    'limit=0',
    'limit=101',
    'limit=1.5',
    'limit=1e1',
    'limit=',
    'limit=1&limit=2',
    'unknown=1',
    'cursor=a&cursor=b',
  ])
    await error(await request(`/api/posts?${query}`), 400, 'VALIDATION_ERROR');
  const payload = { published_at: '2026-10-12T00:00:00.000Z', id };
  assert.deepEqual(decodeCursor(encodeCursor(payload)), { v: 1, ...payload });
  for (const value of [
    '',
    '=',
    'x'.repeat(1025),
    btoa('{}'),
    encodeCursor({ ...payload, id: 'invalid' }),
    encodeCursor({ ...payload, published_at: '2026-02-30T00:00:00.000Z' }),
    btoa(JSON.stringify({ v: 2, ...payload })),
    btoa(JSON.stringify({ v: 1, ...payload, extra: true })),
  ])
    await error(
      await request(`/api/posts?cursor=${encodeURIComponent(value)}`),
      400,
      'INVALID_CURSOR',
    );
});
test('database failures are sanitized; missing dependency is unavailable', async () => {
  await error(await request('/api/posts'), 500, 'INTERNAL_ERROR');
  await error(await request(`/api/posts/${id}`), 500, 'INTERNAL_ERROR');
  await error(
    await request(`/api/posts/${id}`, { method: 'DELETE', headers }),
    500,
    'INTERNAL_ERROR',
  );
  const env = { ...fixture().env, DB: undefined } as unknown as Env;
  await error(
    await request('/api/posts', undefined, env),
    503,
    'SERVICE_UNAVAILABLE',
  );
});
test('URL normalization follows contract v1 without merging different content', () => {
  assert.equal(
    canonicalizeUrl('HTTP://EXAMPLE.COM:80/News?b=2&a=1&utm_source=test#part'),
    'http://example.com/News?b=2&a=1',
  );
  assert.equal(
    canonicalizeUrl('https://EXAMPLE.com:443'),
    'https://example.com/',
  );
  assert.equal(canonicalizeUrl(null), null);
  for (const [left, right] of [
    ['https://x.test/News', 'https://x.test/news'],
    ['https://x.test/a', 'https://x.test/a/'],
    ['https://x.test/?v=1', 'https://x.test/?v=2'],
    ['https://x.test/?a=1&b=2', 'https://x.test/?b=2&a=1'],
  ])
    assert.notEqual(canonicalizeUrl(left!), canonicalizeUrl(right!));
});

test('streamed requests enforce the byte limit despite an understated Content-Length', async () => {
  let canceled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(CONTENT_LIMITS.request_bytes));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() {
      canceled = true;
    },
  });
  const response = await worker.fetch(
    new Request('https://example.com/api/posts', {
      method: 'POST',
      headers: { ...headers, 'Content-Length': '1' },
      body,
      duplex: 'half',
    } as RequestInit),
    fixture().env,
  );
  await error(response, 413, 'PAYLOAD_TOO_LARGE');
  assert.equal(canceled, true);
});
