import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker/index.ts';
import type { Env } from '../worker/env.ts';

function fixture() {
  let assetRequests = 0;
  // Never use D1; a read or write attempt fails the test immediately.
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
          throw new Error('Scaffold must not access D1');
        },
      },
    ),
  } as unknown as Env;
  return { env, assetRequests: () => assetRequests };
}

test('all reserved endpoints return explicit JSON 501 without touching assets or D1', async () => {
  const { env, assetRequests } = fixture();
  for (const [method, path] of [
    ['GET', '/api/posts'],
    ['POST', '/api/posts'],
    ['GET', '/api/posts/example-id'],
    ['DELETE', '/api/posts/example-id'],
  ] as const) {
    const response = await worker.fetch(
      new Request(`https://example.com${path}`, { method }),
      env,
    );
    assert.equal(response.status, 501);
    assert.match(
      response.headers.get('content-type') ?? '',
      /application\/json/,
    );
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), {
      ok: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'This endpoint is reserved; implementation is pending.',
      },
    });
  }
  assert.equal(assetRequests(), 0);
});

test('unknown API routes stay JSON and supported routes reject wrong methods', async () => {
  const { env } = fixture();
  for (const path of [
    '/api',
    '/api/unknown',
    '/api/posts/id/nested',
    '/api/posts/',
  ]) {
    assert.equal(
      (await worker.fetch(new Request(`https://example.com${path}`), env))
        .status,
      404,
    );
  }
  const response = await worker.fetch(
    new Request('https://example.com/api/posts', { method: 'PUT' }),
    env,
  );
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, POST');
});

test('non-API requests fall through to the Static Assets binding', async () => {
  const { env, assetRequests } = fixture();
  assert.equal(
    await (await worker.fetch(new Request('https://example.com/'), env)).text(),
    'static asset',
  );
  assert.equal(
    await (
      await worker.fetch(new Request('https://example.com/apiculture'), env)
    ).text(),
    'static asset',
  );
  assert.equal(assetRequests(), 2);
});
