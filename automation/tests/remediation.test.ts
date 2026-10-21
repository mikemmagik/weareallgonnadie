import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  rm,
  mkdir,
  chmod,
  symlink,
  stat,
  chown,
} from 'node:fs/promises';
import dns from 'node:dns/promises';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  prepareUrl,
  linkPayload,
  extractMetadata,
  providerEmbed,
} from '../core/metadata.ts';
import {
  publicHttp,
  retryRequest,
  RequestFailure,
  UnsafeUrlError,
} from '../core/http.ts';
import { handleUpdate } from '../telegram/handler.ts';
import { publicPreviewUrl } from '../../shared/preview.ts';
import { State, Publisher, payloadKey } from '../core/state.ts';
import { Api } from '../core/api.ts';
import { playerFor } from '../../src/lib/presentation.ts';

for (const status of [404, 410])
  test(`D01: confirmed original ${status} rejects preparation`, async () => {
    await assert.rejects(
      prepareUrl(
        'https://example.com/gone',
        async () => new Response('', { status }),
      ),
    );
  });

for (const host of ['vt.tiktok.com', 'vm.tiktok.com'])
  test(`D02: ${host} uses resolved video and keeps submitted URL`, async () => {
    const original = `https://${host}/fixture/`;
    const resolved = 'https://www.tiktok.com/@test/video/6718335390845095173';
    const result = await prepareUrl(original, async () => {
      const response = new Response('', {
        headers: { 'content-type': 'text/html' },
      });
      Object.defineProperty(response, 'url', { value: resolved });
      return response;
    });
    assert.equal(result.url, original);
    assert.equal(result.type, 'video');
    assert.equal(result.embed?.kind, 'provider');
    assert.ok(playerFor(result.embed));
  });

test('D04: existing 0755 state directory fails closed without chmod', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-fix-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'state');
  await mkdir(path);
  await chmod(path, 0o755);
  await assert.rejects(new State(path).write('test.json', {}), /0700|private/);
});

for (const status of [502, 504])
  test(`D05: exhausted ${status} retains outgoing payload`, async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'waagd-fix-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const state = new State(dir);
    const publisher = new Publisher(
      new Api(
        'https://example.com',
        'test-only',
        async () => new Response('', { status }),
        async () => {},
      ),
      state,
    );
    const payload = linkPayload(
      'https://example.com/story',
      'Test',
      'Test',
      'telegram',
    );
    await assert.rejects(publisher.submit(payload));
    assert.ok(await state.read(`outgoing-${payloadKey(payload)}.json`));
  });

test('D03: Reddit uses an isolated adapter and keeps restricted originals without bypass', async () => {
  assert.ok(
    playerFor({
      kind: 'provider',
      provider: 'reddit',
      id: 'abc123',
      url: 'https://www.reddit.com/r/test/comments/abc123/title/',
    }),
  );
  assert.equal(
    providerEmbed('https://www.reddit.com/r/test/comments/abc123/title/').kind,
    'provider',
  );
  for (const url of [
    'https://www.reddit.com/r/test/comments/invalid!/',
    'https://www.reddit.com/user/test/',
  ])
    assert.equal(providerEmbed(url).kind, 'link');
  const restricted = await prepareUrl(
    'https://www.reddit.com/r/private/comments/abc123/title/',
    async () => new Response('', { status: 403 }),
  );
  assert.ok(playerFor(restricted.embed));
  assert.equal(
    restricted.url,
    'https://www.reddit.com/r/private/comments/abc123/title/',
  );
  assert.equal(restricted.title, 'Reddit');
});

test('D01: available originals publish neutrally; failed embeds cannot establish removal', async () => {
  for (const original of [
    'https://example.com/no-metadata',
    'https://youtu.be/abcdefghijk',
  ]) {
    const requests: string[] = [];
    const result = await prepareUrl(original, async (url) => {
      requests.push(url);
      return new Response('', { headers: { 'content-type': 'text/html' } });
    });
    assert.equal(
      result.title,
      original.includes('youtu.be') ? 'YouTube' : new URL(original).hostname,
    );
    assert.equal(result.url, original);
    assert.deepEqual(
      requests,
      [original],
      'No optional embed request affects original availability',
    );
  }
  for (const status of [403, 429]) {
    const result = await prepareUrl(
      'https://example.com/uncertain',
      async () =>
        new Response('', { status, headers: { 'retry-after': '120' } }),
    );
    assert.equal(result.title, 'example.com');
  }
});

test('D02: direct, invalid and unsupported redirected TikTok destinations retain safe metadata', async () => {
  const video = 'https://www.tiktok.com/@test/video/6718335390845095173';
  assert.equal(providerEmbed(video).kind, 'provider');
  for (const target of [
    'https://www.tiktok.com/@test/video/123',
    'https://www.tiktok.com/@test/video/not-an-id',
    'https://example.com/article',
  ]) {
    const original = 'https://vt.tiktok.com/fixture/?utm_source=test';
    const result = await prepareUrl(original, async () => {
      const response = new Response('');
      Object.defineProperty(response, 'url', { value: target });
      return response;
    });
    assert.equal(result.embed?.kind, 'link');
    assert.equal(result.type, 'news');
    assert.equal(result.url, original);
    assert.equal(result.canonical_url, 'https://vt.tiktok.com/fixture/');
  }
});

test('D02/SEC-003: mocked DNS and sockets preserve pinning, redirect checks, bounds and deadline', async (t) => {
  const destinations: string[] = [];
  const lookups: string[] = [];
  let routes = new Map<
    string,
    { status: number; location?: string; body?: string; contentType?: string }
  >();
  let lookupMode = 'public';
  t.mock.method(dns, 'lookup', async (host: string) => {
    lookups.push(host);
    if (lookupMode === 'pending') return new Promise(() => {});
    return lookupMode === 'mixed'
      ? [
          { address: '8.8.8.8', family: 4 },
          { address: '10.0.0.1', family: 4 },
        ]
      : [{ address: '8.8.8.8', family: 4 }];
  });
  t.mock.method(
    https,
    'request',
    (
      url: URL,
      options: RequestOptions,
      callback: (res: IncomingMessage) => void,
    ) => {
      destinations.push(url.toString());
      assert.equal(
        new Headers(options.headers as Record<string, string>).get(
          'authorization',
        ),
        null,
      );
      assert.equal(options.family, 4);
      assert.ok(options.lookup);
      options.lookup(url.hostname, {}, (error, address, family) => {
        assert.equal(error, null);
        assert.equal(address, '8.8.8.8');
        assert.equal(family, 4);
      });
      const req = new EventEmitter();
      Object.assign(req, {
        end: () =>
          queueMicrotask(() => {
            const route = routes.get(url.toString()) ?? { status: 200 };
            const res = new EventEmitter();
            Object.assign(res, {
              statusCode: route.status,
              headers: {
                'content-type': route.contentType ?? 'text/html',
                ...(route.location ? { location: route.location } : {}),
              },
              destroy: () => {},
            });
            callback(res as IncomingMessage);
            res.emit('data', Buffer.from(route.body ?? ''));
            res.emit('end');
          }),
      });
      return req as ClientRequest;
    },
  );
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  });
  const final = 'https://www.tiktok.com/@test/video/6718335390845095173';
  for (const host of ['vt.tiktok.com', 'vm.tiktok.com']) {
    destinations.length = 0;
    lookups.length = 0;
    const start = `https://${host}/fixture/`;
    routes = new Map([
      [start, { status: 302, location: 'https://www.tiktok.com/redirect' }],
      ['https://www.tiktok.com/redirect', { status: 307, location: final }],
    ]);
    const result = await prepareUrl(start);
    assert.equal(result.url, start);
    assert.equal(result.type, 'video');
    assert.equal(result.embed?.url, final);
    assert.equal(
      result.embed?.kind === 'provider' && result.embed.id,
      '6718335390845095173',
    );
    assert.equal(
      playerFor(result.embed)?.src,
      'https://www.tiktok.com/player/v1/6718335390845095173?autoplay=0',
    );
    assert.deepEqual(destinations, [
      start,
      'https://www.tiktok.com/redirect',
      final,
    ]);
    assert.deepEqual(lookups, [host, 'www.tiktok.com', 'www.tiktok.com']);
  }
  const start = 'https://vt.tiktok.com/unsafe/';
  for (const location of [
    'https://localhost/',
    'https://10.0.0.1/',
    'https://[::1]/',
  ]) {
    destinations.length = 0;
    routes = new Map([[start, { status: 302, location }]]);
    await assert.rejects(publicHttp(start), UnsafeUrlError);
    assert.deepEqual(destinations, [start]);
  }
  lookupMode = 'mixed';
  destinations.length = 0;
  await assert.rejects(publicHttp(start), UnsafeUrlError);
  assert.equal(destinations.length, 0);
  lookupMode = 'public';
  routes = new Map([[start, { status: 302, location: start }]]);
  destinations.length = 0;
  await assert.rejects(publicHttp(start), /Too many redirects/);
  assert.equal(destinations.length, 5);
  routes = new Map([[start, { status: 200, body: 'x'.repeat(2_000_001) }]]);
  await assert.rejects(publicHttp(start), /Response too large/);
  routes = new Map([
    [start, { status: 200, body: 'not buffered', contentType: 'video/mp4' }],
  ]);
  assert.equal(await (await publicHttp(start)).text(), '');
  lookupMode = 'pending';
  destinations.length = 0;
  const controller = new AbortController();
  const pending = publicHttp(start, { signal: controller.signal });
  setTimeout(() => controller.abort(new Error('DNS deadline reached')), 20);
  await assert.rejects(pending, /DNS deadline reached/);
  assert.equal(
    destinations.length,
    0,
    'No socket opens after an aborted lookup',
  );
});

test('D04: state read/write/remove/list/locks reject unsafe directories, links and files', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-fix-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const state = new State(join(dir, 'fresh'));
  await state.write('test.json', { private: true });
  assert.equal((await stat(state.dir)).mode & 0o777, 0o700);
  assert.equal((await stat(join(state.dir, 'test.json'))).mode & 0o777, 0o600);
  assert.deepEqual(await state.read('test.json'), { private: true });
  await state.locked('test', async () =>
    assert.equal(
      (await stat(join(state.dir, 'test.lock'))).mode & 0o777,
      0o700,
    ),
  );
  await symlink(state.dir, join(dir, 'link'));
  await assert.rejects(new State(join(dir, 'link')).names(), /symlink/);
  await assert.rejects(
    new State(join(dir, 'link', 'child')).ensure(),
    /symlink/,
  );
  await symlink(join(state.dir, 'test.json'), join(state.dir, 'linked.json'));
  for (const action of [
    () => state.read('linked.json'),
    () => state.write('linked.json', {}),
    () => state.remove('linked.json'),
  ])
    await assert.rejects(action(), /Unsafe state file/);
  await chmod(join(state.dir, 'test.json'), 0o644);
  await assert.rejects(state.read('test.json'), /0600/);
  await chmod(join(state.dir, 'test.json'), 0o600);
  await assert.rejects(state.write('../escape.json', {}), /filename/);
  await chmod(state.dir, 0o755);
  for (const action of [
    () => state.read('test.json'),
    () => state.write('test.json', {}),
    () => state.remove('test.json'),
    () => state.names(),
    () => state.locked('test', async () => {}),
  ])
    await assert.rejects(action(), /0700/);
  assert.equal((await stat(state.dir)).mode & 0o777, 0o755);
  if (process.getuid?.() === 0) {
    await chmod(state.dir, 0o700);
    await chown(state.dir, 12345, 12345);
    await assert.rejects(state.ensure(), /ownership/);
  } else {
    // Non-root users cannot chown a fixture to another user. Simulate the caller UID.
    await chmod(state.dir, 0o700);
    const uid = process.getuid!();
    t.mock.method(
      process as NodeJS.Process & { getuid(): number },
      'getuid',
      () => uid + 1,
    );
    await assert.rejects(state.ensure(), /ownership/);
    t.mock.restoreAll();
  }
});

test('D05: gateway recovery, duplicate replay, retry metadata and accurate Telegram failures', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'waagd-fix-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let status = 502;
  let outcome = 'created';
  let calls = 0;
  const state = new State(dir);
  const publisher = new Publisher(
    new Api(
      'https://example.com',
      'test-only',
      async (_url, init) => {
        calls++;
        if (status !== 200) return new Response('', { status });
        const input = JSON.parse(String(init?.body));
        return Response.json({
          ok: true,
          data: {
            outcome,
            matched_by: 'canonical_url',
            post: {
              ...input,
              id: '00000000-0000-4000-8000-000000000001',
              published_at: '2026-10-13T00:00:00.000Z',
              deleted_at: null,
            },
          },
        });
      },
      async () => {},
    ),
    state,
  );
  await publisher.setPaused('auto', false);
  const update = {
    message: {
      from: { id: 123 },
      chat: { id: 123, type: 'private' },
      text: 'https://example.com/story',
    },
  };
  const metadata = async () => new Response('');
  assert.match(
    (await handleUpdate(update, new Set(['123']), publisher, metadata))!.text,
    /saved locally for retry/,
  );
  assert.equal(calls, 3);
  const name = (await state.names()).find((name) =>
    name.startsWith('outgoing-'),
  )!;
  const saved = (await state.read(name)) as {
    attempts: number;
    last_status: number;
    next_attempt_at: number;
  };
  assert.equal(saved.attempts, 1);
  assert.equal(saved.last_status, 502);
  assert.ok(saved.next_attempt_at <= Date.now());
  status = 200;
  assert.deepEqual(await publisher.replay(), { sent: 1, failed: 0 });
  assert.equal(await state.read(name), null);
  status = 504;
  await handleUpdate(update, new Set(['123']), publisher, metadata);
  status = 200;
  outcome = 'duplicate';
  assert.deepEqual(await publisher.replay(), { sent: 1, failed: 0 });
  assert.equal((await publisher.processed()).length, 1);
  for (const permanent of [400, 401]) {
    status = permanent;
    const reply = (await handleUpdate(
      update,
      new Set(['123']),
      publisher,
      metadata,
    ))!;
    assert.match(reply.text, /No publication payload was saved/);
    assert.doesNotMatch(reply.text, /is saved locally/);
    assert.equal(
      (await state.names()).filter((n) => n.startsWith('outgoing-')).length,
      0,
    );
  }
  const missing = (await handleUpdate(
    update,
    new Set(['123']),
    publisher,
    async () => new Response('', { status: 404 }),
  ))!;
  assert.match(missing.text, /Original publication is missing \(HTTP 404\)/);
  assert.match(missing.text, /No publication payload was saved/);
});

test('D05: complete retry set has three attempts, honors Retry-After dates and stops permanent errors', async () => {
  for (const status of [408, 429, 500, 502, 503, 504, 400, 401]) {
    let calls = 0;
    const waits: number[] = [];
    await assert.rejects(
      retryRequest(
        async () => {
          calls++;
          return new Response('', { status, headers: { 'retry-after': '2' } });
        },
        'https://example.com',
        {},
        async (delay) => {
          waits.push(delay);
        },
      ),
      (error: unknown) =>
        error instanceof RequestFailure &&
        error.retryable === ![400, 401].includes(status),
    );
    assert.equal(calls, [400, 401].includes(status) ? 1 : 3);
    assert.deepEqual(waits, [400, 401].includes(status) ? [] : [2000, 2000]);
  }
  const after = new Date(Date.now() + 120_000).toUTCString();
  await assert.rejects(
    retryRequest(
      async () =>
        new Response('', { status: 504, headers: { 'retry-after': after } }),
      'https://example.com',
      {},
      async () => assert.fail('Long delay must be deferred'),
    ),
    (error: unknown) =>
      error instanceof RequestFailure && error.retryAt === Date.parse(after),
  );
});

test('SEC-001: unsafe previews become imageless cards at ingestion and rendering boundaries', () => {
  for (const url of [
    'http://example.com/image.png',
    'https://localhost/image',
    'https://localhost./image',
    'https://box.local/image',
    'https://box.internal/image',
    'https://printer/image',
    'https://127.1/image',
    'https://2130706433/image',
    'https://0x7f000001/image',
    'https://10.0.0.1/image',
    'https://169.254.169.254/image',
    'https://192.168.1.1/image',
    'https://100.64.0.1/image',
    'https://192.0.2.1/image',
    'https://[::1]/image',
    'https://[::ffff:127.0.0.1]/image',
    'https://[fe80::1]/image',
    'https://[2001:db8::1]/image',
    'javascript:alert(1)',
    'data:image/png;base64,test',
    'https://user:secret@example.com/image',
    'https://example.com:8443/image',
  ]) {
    assert.equal(publicPreviewUrl(url), null, url);
    assert.equal(
      extractMetadata(
        `<meta property="og:image" content="${url}">`,
        'https://example.com/story',
      ).image,
      null,
      url,
    );
  }
  assert.equal(
    publicPreviewUrl('https://images.example.com/image.png'),
    'https://images.example.com/image.png',
  );
  assert.equal(
    extractMetadata(
      '<meta property="og:image" content="/image.png">',
      'https://example.com/story',
    ).image,
    'https://example.com/image.png',
  );
});
